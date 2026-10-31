// Stage check station parts (18 Oct 2026, laid out like 2.0's universal workstation): the stats bar, a progress row
// per part × size / bundle / garment size with INSPECT and FIX REWORK, the supervisor password dialog (rework block,
// undo), the checker's work log (Excel) and "why isn't this stage complete?" with Recalculate.
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import * as XLSX from 'xlsx';
import { CalendarDays, Download, HelpCircle, RefreshCw, KeyRound, Hammer, CheckCircle2, Check, Clock, ThumbsUp, Undo2, Loader2, Wrench, ChevronRight } from 'lucide-react';
import Modal from '../../shared/Modal';
import { productionApi } from '../api/productionApi';
import { apiError } from '../api/mastersApi';
import { Field, inputCls, SecondaryButton, ErrorBox, Loading } from '../components/ui';

const label = (s) => String(s || '').toLowerCase().replace('_', ' ');

// The checker's own work (30 Oct 2026, like 2.0's Today's Work): by batch, hourly, by roll (part × size under it),
// the defects found most, each piece / garment underneath, and an Excel download. Each item counts once a day by its
// last check — rework then repaired is one item, repaired (the server's checkedItems).
export function WorkLogButton() {
    const [open, setOpen] = useState(false);
    return (
        <>
            <button type="button" onClick={() => setOpen(true)} className="flex items-center gap-1.5 text-sm font-bold text-slate-700 hover:text-indigo-700 border-2 border-slate-200 hover:border-indigo-300 px-3 py-2 rounded-xl bg-white">
                <CalendarDays size={15} /> Today's work
            </button>
            {open && <WorkLog onClose={() => setOpen(false)} />}
        </>
    );
}

const RESULT = { APPROVED: ['OK', 'text-emerald-700'], REPAIRED: ['Repaired', 'text-teal-700'], NEEDS_REWORK: ['In rework', 'text-amber-700'], QC_REJECTED: ['Rejected', 'text-rose-700'], UNDONE: ['Undone', 'text-slate-400 line-through'] };
const COLS = [['checked', 'Checked', 'font-black text-slate-800'], ['approved', 'OK', 'text-emerald-700'], ['repaired', 'Repaired', 'text-teal-700'], ['in_rework', 'In rework', 'text-amber-700'], ['rejected', 'Rejected', 'text-rose-700'], ['rework_found', 'Rework found', 'text-indigo-700']];
const istTime = (t) => new Date(t).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit' });
const dayLabel = (day) => new Date(`${day}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
const hourLabel = (h) => `${h}:00 – ${String(Number(h) + 1).padStart(2, '0')}:00`;
const rollLabel = (r) => (r.roll_no != null ? `Roll #${r.roll_no}` : 'No roll');
const groupLabel = (g) => [g.part_name, g.size && `Size ${g.size}`].filter(Boolean).join(' · ') || '—';
const sumOf = (list) => Object.fromEntries(COLS.map(([k]) => [k, list.reduce((t, r) => t + (r[k] || 0), 0)]));
const th = 'px-3 py-2', td = 'px-3 py-1.5';

function Nums({ t }) {
    return COLS.map(([k, , cls]) => <td key={k} className={`${td} text-right tabular-nums ${cls}`}>{t[k] || ''}</td>);
}
function Head({ first, extra = [] }) {
    return (
        <thead className="bg-slate-50 text-xs font-bold text-slate-500 uppercase tracking-wider sticky top-0 z-10"><tr className="text-left">
            {first.map(f => <th key={f} className={th}>{f}</th>)}
            {COLS.map(([k, l]) => <th key={k} className={`${th} text-right`}>{l}</th>)}
            {extra.map(f => <th key={f} className={`${th} text-right`}>{f}</th>)}
        </tr></thead>
    );
}
function Foot({ span, t, extra = [] }) {
    return (
        <tfoot className="bg-slate-100 font-bold sticky bottom-0"><tr className="border-t-2 border-slate-300">
            <td colSpan={span} className={td}>Total</td><Nums t={t} />{extra.map((x, i) => <td key={i} className={`${td} text-right tabular-nums`}>{x || ''}</td>)}
        </tr></tfoot>
    );
}
// The pieces / garments under an hour or a part × size.
function ItemRows({ items, span, truncated }) {
    if (!items.length) return <tr><td colSpan={span} className="px-6 py-2 text-xs text-slate-500">{truncated ? 'Too many checks to list here — choose a shorter range.' : 'Nothing to list.'}</td></tr>;
    return (
        <tr><td colSpan={span} className="px-6 pb-2 pt-1 bg-slate-50/60">
            <div className="max-h-64 overflow-auto rounded-lg border border-slate-200 bg-white">
                <table className="w-full text-xs">
                    <tbody>{items.map(i => (
                        <tr key={i.id} className="border-t border-slate-100 first:border-t-0">
                            <td className="px-2 py-1 tabular-nums text-slate-500 w-24">{istTime(i.at)}</td>
                            <td className="px-2 py-1 font-mono font-bold text-slate-800">{i.label}</td>
                            <td className="px-2 py-1 text-slate-500">{i.batch_code} · {i.stage}{i.roll_no != null ? ` · Roll #${i.roll_no}` : ''}{i.part_name ? ` · ${i.part_name}` : ''}{i.size ? ` · ${i.size}` : ''}</td>
                            <td className={`px-2 py-1 font-bold ${RESULT[i.result]?.[1] || ''}`}>{RESULT[i.result]?.[0] || i.result}{i.rework_found && i.result !== 'NEEDS_REWORK' ? <span className="ml-1 font-normal text-indigo-600">(after rework)</span> : null}</td>
                            <td className="px-2 py-1 font-mono text-slate-600">{i.defect_code || ''}</td>
                        </tr>
                    ))}</tbody>
                </table>
            </div>
        </td></tr>
    );
}
function Toggle({ open, onClick, children, cls = '' }) {
    return (
        <button type="button" onClick={onClick} className={`inline-flex items-center gap-1.5 text-left ${cls}`}>
            <ChevronRight size={14} className={`text-slate-400 shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} />{children}
        </button>
    );
}

function WorkLog({ onClose }) {
    const [range, setRange] = useState({ from: '', to: '' });
    const [d, setD] = useState(null);
    const [error, setError] = useState('');
    const [mode, setMode] = useState('hourly');
    const [open, setOpen] = useState(() => new Set());
    const load = (p) => { setError(''); setOpen(new Set()); productionApi.workLog(p).then(r => { setD(r.data); setRange({ from: r.data.from, to: r.data.to }); }).catch(err => setError(apiError(err, 'Failed to load.'))); };
    useEffect(() => { load({}); }, []);
    const toggle = (k) => setOpen(prev => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n; });
    const multiDay = d && d.from !== d.to;
    const t = d?.totals;
    const excel = () => {
        const nums = (r) => Object.fromEntries(COLS.map(([k, l]) => [l, r[k] || 0]));
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(d.rows.map(r => ({ Date: r.day, Batch: r.batch_code, Order: r.order_no, Stage: r.stage, Unit: r.unit, ...nums(r), Undone: r.undone, 'Undos by me': r.reverted, First: istTime(r.first_at), Last: istTime(r.last_at) }))), 'By batch');
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(d.hours.map(h => ({ Date: h.day, Hour: hourLabel(h.hour), ...nums(h) }))), 'Hourly');
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(d.rolls.flatMap(r => r.groups.map(g => ({ Batch: r.batch_code, Stage: r.stage, Roll: r.roll_no ?? '', Part: g.part_name || '', Size: g.size || '', ...nums(g) })))), 'By roll');
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(d.defects.map(x => ({ Defect: x.code, Description: x.description, Items: x.count }))), 'Defects');
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(d.items.map(i => ({ Date: i.day, Time: istTime(i.at), Item: i.label, Batch: i.batch_code, Stage: i.stage, Roll: i.roll_no ?? '', Part: i.part_name || '', Size: i.size || '', Result: RESULT[i.result]?.[0] || i.result, 'After rework': i.rework_found && i.result !== 'NEEDS_REWORK' ? 'Yes' : '', Defect: i.defect_code || '' }))), 'Checks');
        XLSX.writeFile(wb, `My-work-${d.from}${multiDay ? `-to-${d.to}` : ''}.xlsx`);
    };
    const days = d ? [...new Set(d.rows.map(r => r.day))] : [];
    const hourDays = d ? [...new Set(d.hours.map(h => h.day))] : [];
    const tab = (k, l) => <button type="button" onClick={() => { setMode(k); setOpen(new Set()); }} className={`px-3 py-1.5 text-sm font-bold rounded-md ${mode === k ? 'bg-white shadow text-indigo-700' : 'text-slate-500 hover:text-slate-700'}`}>{l}</button>;
    return (
        <Modal title="My work log" onClose={onClose}>
            <div className="w-[min(1000px,94vw)] space-y-3">
                <div className="flex flex-wrap items-end gap-2">
                    <Field label="From"><input type="date" className={inputCls} value={range.from} onChange={e => setRange({ ...range, from: e.target.value })} /></Field>
                    <Field label="To"><input type="date" className={inputCls} value={range.to} onChange={e => setRange({ ...range, to: e.target.value })} /></Field>
                    <SecondaryButton onClick={() => load(range)}>Show</SecondaryButton>
                    <SecondaryButton onClick={() => load({})}>Today</SecondaryButton>
                    {d?.items.length > 0 && <span className="ml-auto"><SecondaryButton onClick={excel}><Download size={14} /> Excel</SecondaryButton></span>}
                </div>
                <ErrorBox text={error} />
                {!d ? (!error && <Loading />) : t.checked + t.undone === 0 && !t.reverted ? <p className="text-sm text-slate-500 py-6 text-center">No checks by you in these days.</p> : (
                    <>
                        <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
                            {COLS.map(([k, l, cls]) => <span key={k} className="text-sm text-slate-500">{l} <b className={`text-lg tabular-nums ${cls}`}>{t[k]}</b>{k === 'rework_found' && t.checked > 0 ? <span className="text-xs text-slate-400"> ({Math.round((t.rework_found / t.checked) * 100)}%)</span> : null}</span>)}
                            {t.undone > 0 && <span className="text-xs text-slate-400 inline-flex items-center gap-1"><Undo2 size={11} /> {t.undone} undone</span>}
                            {t.reverted > 0 && <span className="text-xs text-slate-400">· {t.reverted} undos by me</span>}
                        </div>
                        <p className="text-xs text-slate-500">Each piece / garment counts once a day, by your last check — sent to rework and then repaired counts once, as repaired. An undone check is not counted.</p>
                        {d.defects.length > 0 && (
                            <div className="flex flex-wrap items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl">
                                <span className="text-xs font-black text-amber-800 uppercase tracking-wider">Top rework</span>
                                {d.defects.slice(0, 3).map((x, i) => (
                                    <span key={x.code} className="inline-flex items-center gap-1.5 bg-white border border-amber-200 rounded-lg px-2 py-0.5">
                                        <span className="text-xs font-black text-amber-700">{i + 1}</span>
                                        <span className="text-xs font-black font-mono text-slate-800">{x.code}</span>
                                        {x.description && <span className="text-xs text-slate-500 hidden sm:inline">{x.description}</span>}
                                        <span className="text-xs font-bold text-amber-700 bg-amber-100 rounded-full px-1.5">{x.count}×</span>
                                    </span>
                                ))}
                            </div>
                        )}
                        <div className="inline-flex bg-slate-100 rounded-lg p-0.5">{tab('hourly', 'Hourly')}{tab('roll', 'By roll')}{tab('batch', 'By batch')}</div>
                        <div className="max-h-[55vh] overflow-auto border border-slate-200 rounded-xl">
                            {mode === 'hourly' && (
                                <table className="w-full text-sm min-w-[720px]">
                                    <Head first={['Hour']} />
                                    <tbody>{hourDays.map(day => [
                                        multiDay && <tr key={day} className="bg-slate-100/70"><td colSpan={7} className="px-3 py-1 text-xs font-black text-slate-600">{dayLabel(day)}</td></tr>,
                                        ...d.hours.filter(h => h.day === day).flatMap(h => {
                                            const k = `h|${h.day}|${h.hour}`;
                                            return [
                                                <tr key={k} className="border-t border-slate-100 hover:bg-slate-50"><td className={td}><Toggle open={open.has(k)} onClick={() => toggle(k)} cls="font-bold text-slate-800">{hourLabel(h.hour)}</Toggle></td><Nums t={h} /></tr>,
                                                open.has(k) && <ItemRows key={`${k}|i`} span={7} truncated={d.items_truncated} items={d.items.filter(i => i.day === h.day && i.hour === h.hour)} />,
                                            ];
                                        }),
                                    ])}</tbody>
                                    <Foot span={1} t={sumOf(d.hours)} />
                                </table>
                            )}
                            {mode === 'roll' && (
                                <table className="w-full text-sm min-w-[720px]">
                                    <Head first={['Roll']} />
                                    <tbody>{d.rolls.flatMap(r => {
                                        const k = `r|${r.key}`;
                                        return [
                                            <tr key={k} className="border-t border-slate-200 bg-white hover:bg-slate-50">
                                                <td className={td}><Toggle open={open.has(k)} onClick={() => toggle(k)}><b className="text-slate-800">{rollLabel(r)}</b><span className="text-xs text-slate-500">{r.batch_code} · {r.stage}</span></Toggle></td><Nums t={r} />
                                            </tr>,
                                            ...(open.has(k) ? r.groups.flatMap(g => {
                                                const gk = `${k}|${g.part_name || ''}|${g.size || ''}`;
                                                return [
                                                    <tr key={gk} className="border-t border-slate-100 bg-slate-50/50"><td className={`${td} pl-8`}><Toggle open={open.has(gk)} onClick={() => toggle(gk)} cls="text-slate-700 font-semibold">{groupLabel(g)}</Toggle></td><Nums t={g} /></tr>,
                                                    open.has(gk) && <ItemRows key={`${gk}|i`} span={7} truncated={d.items_truncated} items={d.items.filter(i => `${i.batch_id}|${i.stage}|${i.roll_no ?? ''}` === `${r.batch_id}|${r.stage}|${r.roll_no ?? ''}` && (i.part_name || '') === (g.part_name || '') && (i.size || '') === (g.size || ''))} />,
                                                ];
                                            }) : []),
                                        ];
                                    })}</tbody>
                                    <Foot span={1} t={sumOf(d.rolls)} />
                                </table>
                            )}
                            {mode === 'batch' && (
                                <table className="w-full text-sm min-w-[820px]">
                                    <Head first={['Batch', 'Stage']} extra={['Undone', 'Time']} />
                                    <tbody>{days.map(day => [
                                        <tr key={day} className="bg-slate-100/70"><td colSpan={10} className="px-3 py-1 text-xs font-black text-slate-600">{dayLabel(day)}</td></tr>,
                                        ...d.rows.filter(r => r.day === day).map(r => (
                                            <tr key={`${day}-${r.batch_id}-${r.stage}`} className="border-t border-slate-100">
                                                <td className={td}><b>{r.batch_code}</b></td><td className={td}>{r.stage}{r.unit === 'garments' ? ' (garments)' : ''}</td><Nums t={r} />
                                                <td className={`${td} text-right tabular-nums text-slate-500`}>{r.undone || ''}{r.reverted ? <span className="text-xs"> {r.undone ? '· ' : ''}{r.reverted} by me</span> : ''}</td>
                                                <td className={`${td} text-right tabular-nums text-xs text-slate-500 whitespace-nowrap`}>{istTime(r.first_at).slice(0, 5)}–{istTime(r.last_at).slice(0, 5)}</td>
                                            </tr>
                                        )),
                                    ])}</tbody>
                                    <Foot span={2} t={sumOf(d.rows)} extra={[d.rows.reduce((x, r) => x + (r.undone || 0), 0), '']} />
                                </table>
                            )}
                        </div>
                        {d.items_truncated && <p className="text-xs text-amber-700">The counts are complete; only the latest {d.items.length} checks are listed under the rows and in Excel — choose a shorter range for all of them.</p>}
                    </>
                )}
            </div>
        </Modal>
    );
}

// "Why isn't this stage complete?": the recorded status vs what the pieces / garments say, what is holding it,
// and Recalculate (re-runs the handoff for every started stage of the batch).
export function WhyPanel({ batchId, stageId, complete, tick, onFixed }) {
    const [open, setOpen] = useState(false);
    const [d, setD] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [msg, setMsg] = useState('');
    const why = (err) => (err?.response?.status === 404 && !err.response.data?.error ? 'The server is running an older backend — restart it to use this.' : apiError(err, 'Failed.'));
    useEffect(() => { if (open) productionApi.stageWhy(batchId, stageId).then(r => { setD(r.data); setError(''); }).catch(err => setError(why(err))); }, [open, batchId, stageId, tick]); // eslint-disable-line react-hooks/exhaustive-deps
    const recalc = async () => {
        setBusy(true); setError(''); setMsg('');
        try {
            const r = await productionApi.refresh(batchId);
            const now = r.data.stages[stageId];
            setMsg(`Recalculated — this stage is ${label(now || 'pending')}.`);
            setD((await productionApi.stageWhy(batchId, stageId)).data); onFixed?.();
        } catch (err) { setError(why(err)); } finally { setBusy(false); }
    };
    if (!open) {
        return <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 text-sm font-bold text-indigo-700 bg-white border-2 border-indigo-200 hover:border-indigo-400 px-3 py-2 rounded-xl"><HelpCircle size={15} /> {complete ? 'Stage status' : "Why isn't this stage complete?"}</button>;
    }
    return (
        <div className="mb-3 bg-indigo-50/50 border border-indigo-200 rounded-xl px-3 py-2 text-sm">
            <div className="flex flex-wrap items-center gap-2">
                <p className="font-bold text-slate-800">Stage status</p>
                {d && <span className="text-sm text-slate-600">{d.final} of {d.total} {d.unit === 'GARMENT' ? 'garments' : 'pieces'} done · recorded <b>{label(d.recorded)}</b>{d.recorded !== d.actual ? <> · should be <b>{label(d.actual)}</b></> : ''}</span>}
                <span className="ml-auto flex gap-2">
                    <SecondaryButton onClick={recalc} disabled={busy}><RefreshCw size={13} className={busy ? 'animate-spin' : ''} /> Recalculate</SecondaryButton>
                    <button type="button" onClick={() => setOpen(false)} className="text-sm text-slate-500 underline">close</button>
                </span>
            </div>
            <ErrorBox text={error} />
            {msg && <p className="text-sm text-emerald-700 mt-1">{msg}</p>}
            {!d ? (!error && <Loading />) : (
                <>
                    {d.out_of_step && <p className="mt-1 text-sm font-semibold text-amber-800">The recorded status is out of date — Recalculate puts it right (and hands the batch on to the next stage).</p>}
                    {d.reasons.length === 0 ? <p className="mt-1 text-sm text-emerald-700">Nothing is holding this stage{d.actual === 'COMPLETED' ? ' — it is complete.' : '.'}</p> : (
                        <ul className="mt-1 space-y-1">{d.reasons.map((r, i) => (
                            <li key={i} className="text-sm"><b className="tabular-nums">{r.count}</b> · {r.label}
                                {r.sample.length > 0 && <span className="ml-1 font-mono text-xs text-slate-500">{r.sample.join(', ')}{r.count > r.sample.length ? ' …' : ''}</span>}</li>
                        ))}</ul>
                    )}
                </>
            )}
        </div>
    );
}

// 2.0-style summary bar: the station's pending rework, my day, this hour.
export function StatsBar({ stageId, lineId, tick }) {
    const [s, setS] = useState(null);
    const [old, setOld] = useState(false);
    useEffect(() => { productionApi.myStats(stageId, lineId).then(r => { setS(r.data); setOld(false); }).catch(err => { setS(null); setOld(err?.response?.status === 404 && !err.response.data?.error); }); }, [stageId, lineId, tick]);
    if (old) return <p className="text-sm font-bold text-rose-700">Today's numbers need the latest backend — restart the server.</p>;
    const v = (x) => (s == null ? '—' : x);
    const items = [
        [Hammer, 'Pending rework', v(s?.rework?.pending ?? '—'), s?.rework?.blocked ? 'text-rose-600' : s?.rework?.pending ? 'text-amber-500' : 'text-emerald-600', 'text-amber-500'],
        [ThumbsUp, 'Today OK', v((s?.me.approved || 0) + (s?.me.repaired || 0)), 'text-emerald-600', 'text-emerald-500'],
        [Hammer, 'Today rework', v(s?.me.rework_found), 'text-indigo-600', 'text-indigo-400'],
        [Wrench, 'Today repaired', v(s?.me.repaired), 'text-teal-600', 'text-teal-500'],
        [Clock, 'This hour', v(s?.me.this_hour), 'text-sky-600', 'text-sky-500'],
    ];
    return (
        <div className="flex items-center gap-x-5 gap-y-1 flex-wrap">
            {items.map(([Icon, l, n, cls, icls], i) => (
                <div key={l} className="flex items-center gap-1.5">
                    {i > 0 && <span className="text-slate-200 mr-3 hidden sm:inline">│</span>}
                    <Icon size={15} className={`${icls} shrink-0`} /><span className="text-sm text-slate-500">{l}</span>
                    <span className={`text-base font-black tabular-nums ${cls}`}>{n}</span>
                </div>
            ))}
            {s?.station && <span className="text-xs text-slate-400">· station today {s.station.checked}</span>}
            {s?.me.undone > 0 && <span className="text-xs text-slate-400 inline-flex items-center gap-1"><Undo2 size={11} /> {s.me.undone} undone</span>}
        </div>
    );
}

// One row: label, "x / y pieces", a coloured progress bar, and the big buttons (2.0's ValidationProgressRow).
export function ProgressRow({ icon: Icon, label: title, sub, notes = [], unit = 'pieces', total, ok, rework, rejected, earlier = 0, waiting = 0, left, onInspect, onFix, fixCount = 0, onQuick, quickLabel = 'QUICK APPROVE', quickBlocked, busy }) {
    if (!total) return null;
    const pct = (x) => `${(x / total) * 100}%`;
    const complete = left === 0 && fixCount === 0 && waiting === 0;
    return (
        <div className={`p-4 bg-white border-2 border-slate-200 rounded-2xl shadow-sm flex flex-col lg:flex-row lg:items-center gap-3 lg:gap-6 hover:border-indigo-300 ${earlier ? 'border-l-8 border-l-rose-400' : ''}`}>
            <div className="flex items-center lg:w-[38%] min-w-0">
                <div className="p-3 bg-slate-100 text-indigo-600 rounded-xl mr-4 shrink-0"><Icon size={24} /></div>
                <div className="min-w-0">
                    <span className="font-black text-slate-800 tracking-tight block text-lg uppercase">{title}</span>
                    {sub && <span className="text-xs text-indigo-500 font-black uppercase tracking-widest block">{sub}</span>}
                    <span className="text-xs text-slate-500 font-bold uppercase tracking-widest">{total - left - fixCount - waiting} / {total} {unit}</span>
                    {notes.length > 0 && <div className="flex flex-wrap gap-1.5 mt-1.5">{notes.map(([tone, t]) => (
                        <span key={t} className={`text-[11px] font-black uppercase tracking-wider rounded-md px-1.5 py-0.5 border ${tone === 'rose' ? 'bg-rose-100 text-rose-700 border-rose-300' : 'bg-amber-100 text-amber-800 border-amber-300'}`}>{t}</span>
                    ))}</div>}
                </div>
            </div>
            <div className="lg:flex-1 h-3 bg-slate-100 rounded-full flex overflow-hidden shadow-inner">
                <div className="bg-emerald-500" style={{ width: pct(ok) }} />
                <div className="bg-amber-400" style={{ width: pct(rework) }} />
                <div className="bg-rose-500" style={{ width: pct(rejected) }} />
                <div className="bg-rose-300" title="Rejected at an earlier stage" style={{ width: pct(earlier) }} />
                <div className="bg-slate-300" title="Waiting for an earlier stage" style={{ width: pct(waiting) }} />
            </div>
            <div className="flex flex-wrap lg:justify-end items-center gap-3 shrink-0">
                {fixCount > 0 && <button type="button" onClick={onFix} className="px-4 py-3 text-sm bg-amber-100 text-amber-900 border-2 border-amber-200 rounded-xl hover:bg-amber-200 font-black flex items-center active:scale-95"><Hammer className="w-4 h-4 mr-2" /> FIX REWORK ({fixCount})</button>}
                {complete ? (
                    <button type="button" onClick={onInspect} className="px-5 py-3 text-sm text-emerald-700 bg-emerald-50 border-2 border-emerald-200 rounded-xl font-black flex items-center hover:bg-emerald-100 active:scale-95"><Check className="w-4 h-4 mr-2" /> DONE</button>
                ) : <>
                    <button type="button" onClick={onInspect} className="px-7 py-3 text-sm bg-white text-slate-800 border-2 border-slate-300 rounded-xl hover:border-indigo-500 hover:text-indigo-700 font-black active:scale-95">INSPECT</button>
                    {onQuick && left > 0 && <button type="button" onClick={onQuick} disabled={busy || quickBlocked} title={quickBlocked || undefined} className="px-4 py-3 text-sm bg-emerald-100 text-emerald-800 border-2 border-emerald-200 rounded-xl hover:bg-emerald-200 font-black flex items-center active:scale-95 disabled:opacity-40"><CheckCircle2 className="w-4 h-4 mr-2" /> {quickLabel}</button>}
                </>}
            </div>
        </div>
    );
}

// Supervisor password / reason dialog, above the inspection screen (rework block override, undo a check).
export function StationDialog({ title, tone = 'slate', message, quick = [], reasonLabel, reasonRequired, needPin = true, submitLabel, onSubmit, onClose }) {
    const [pin, setPin] = useState('');
    const [reason, setReason] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const submit = async (e) => {
        e.preventDefault(); setBusy(true); setError('');
        try { await onSubmit(pin.trim() || undefined, reason.trim() || undefined); } catch (err) { setError(apiError(err, err?.message || 'Failed.')); } finally { setBusy(false); }
    };
    const head = tone === 'rose' ? 'bg-rose-600 text-white' : tone === 'amber' ? 'bg-amber-400 text-black' : 'bg-black text-white';
    return createPortal(
        <div className="fixed inset-0 z-[350] bg-black/70 flex items-center justify-center p-4">
            <form onSubmit={submit} className="bg-white rounded-2xl shadow-2xl w-[min(560px,94vw)] overflow-hidden">
                <div className={`px-5 py-4 ${head}`}><p className="text-xl font-black uppercase tracking-tight">{title}</p></div>
                <div className="p-5 space-y-4">
                    {message && <p className="text-base font-semibold text-slate-700">{message}</p>}
                    <div>
                        <p className="text-xs font-black uppercase tracking-widest text-slate-500 mb-2">{reasonLabel}{reasonRequired ? ' *' : ''}</p>
                        {quick.length > 0 && <div className="flex flex-wrap gap-2 mb-2">{quick.map(q => (
                            <button key={q} type="button" onClick={() => setReason(q)} className={`px-3 py-2.5 rounded-xl border-2 text-sm font-bold ${reason === q ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-300 text-slate-700'}`}>{q}</button>
                        ))}</div>}
                        <input className={`${inputCls} !py-3 !text-base`} value={reason} onChange={e => setReason(e.target.value)} maxLength={500} placeholder="or type it" />
                    </div>
                    {needPin && <div>
                        <p className="text-xs font-black uppercase tracking-widest text-slate-500 mb-2">Supervisor password *</p>
                        <input type="password" autoComplete="off" autoFocus className={`${inputCls} !py-3 !text-2xl tracking-[0.4em] text-center`} value={pin} onChange={e => setPin(e.target.value)} />
                    </div>}
                    {error && <p className="bg-rose-50 border-2 border-rose-300 text-rose-800 font-bold rounded-xl px-3 py-2">{error}</p>}
                    <div className="grid grid-cols-2 gap-3">
                        <button type="button" onClick={onClose} className="py-4 rounded-xl border-2 border-slate-300 font-black text-slate-700 uppercase tracking-widest">Cancel</button>
                        <button type="submit" disabled={busy || (reasonRequired && !reason.trim()) || (needPin && pin.trim().length < 4)} className="py-4 rounded-xl bg-indigo-600 text-white font-black uppercase tracking-widest disabled:opacity-40 flex items-center justify-center gap-2">
                            {busy ? <Loader2 size={18} className="animate-spin" /> : <KeyRound size={18} />} {submitLabel}</button>
                    </div>
                </div>
            </form>
        </div>,
        document.body,
    );
}

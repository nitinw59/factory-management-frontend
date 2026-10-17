// Production insights (production step 5, after the order tracker): three read-only tabs —
//   WIP ageing: every cut batch's stage in progress or waiting, oldest first, with age buckets per stage and
//               the age of open rework;
//   Quality:    for a date range — first-pass yield, rework %, reject % per stage, line, order and day; top
//               defect codes; open rework and re-cuts;
//   Cost:       material cost per order, issued vs planned (only for roles that see purchase prices).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Hourglass, ShieldCheck, IndianRupee, AlertTriangle } from 'lucide-react';
import { insightsApi } from '../api/insightsApi';
import { apiError } from '../api/mastersApi';
import { PageHeader, SearchInput, ErrorBox, Loading, inputCls } from '../components/ui';
import { fmtDate } from '../salesOrders/SalesOrderStatusBadge';
import { useV3Access } from '../V3Access';
import { PriorityBadge } from '../cutting/cutShared';

const n0 = (v) => Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
export const money = (v) => (v == null ? '—' : `₹${Number(v).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`);
const pctText = (v) => (v == null ? '—' : `${v}%`);
const BUCKET_CLS = { '0-2': 'bg-emerald-500', '3-5': 'bg-amber-400', '6-10': 'bg-orange-500', '11+': 'bg-rose-600' };
const BUCKET_TEXT = { '0-2': 'text-emerald-700', '3-5': 'text-amber-700', '6-10': 'text-orange-700', '11+': 'text-rose-700 font-black' };
const iso = (d) => d.toLocaleDateString('en-CA');
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return iso(d); };

function Kpi({ label, value, sub, tone = 'slate' }) {
    const tones = { slate: 'text-slate-900', green: 'text-emerald-700', amber: 'text-amber-700', red: 'text-rose-700' };
    return (
        <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 min-w-[140px]">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
            <p className={`text-2xl font-black tabular-nums ${tones[tone]}`}>{value}</p>
            {sub && <p className="text-xs text-slate-500">{sub}</p>}
        </div>
    );
}

// Stacked bar of batches by age bucket.
function BucketBar({ buckets, total }) {
    return (
        <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
            {Object.entries(buckets).map(([b, v]) => (v > 0 ? <span key={b} className={BUCKET_CLS[b]} style={{ width: `${(v / Math.max(total, 1)) * 100}%` }} title={`${b} days: ${v}`} /> : null))}
        </div>
    );
}

// ── WIP ageing ───────────────────────────────────────────────────────
function WipTab() {
    const [data, setData] = useState(null);
    const [error, setError] = useState('');
    const [stage, setStage] = useState('');
    const [bucket, setBucket] = useState('');
    const [q, setQ] = useState('');
    useEffect(() => { insightsApi.wip().then(res => setData(res.data)).catch(err => setError(apiError(err, 'Failed to load WIP.'))); }, []);
    const rows = useMemo(() => (data?.batches || []).filter(b => (!stage || b.stage_type_id === stage) && (!bucket || b.bucket === bucket)
        && (!q.trim() || `${b.batch_code} ${b.order_no} ${b.customer_name} ${b.style_code} ${b.line_name || ''}`.toLowerCase().includes(q.trim().toLowerCase()))), [data, stage, bucket, q]);
    if (error) return <ErrorBox text={error} />;
    if (!data) return <Loading />;
    const old = data.batches.filter(b => b.bucket === '11+' || b.bucket === '6-10').length;
    return (
        <div className="space-y-4">
            <div className="flex flex-wrap gap-3">
                <Kpi label="Batch stages open" value={data.batches.length} sub={`${data.batches.filter(b => b.state === 'WAITING').length} waiting to start`} />
                <Kpi label="Older than 5 days" value={old} tone={old ? 'red' : 'green'} />
                <Kpi label="Units ready to check" value={n0(data.batches.reduce((s, b) => s + b.ready, 0))} />
                <Kpi label="Open rework" value={n0(data.rework.reduce((s, r) => s + r.open, 0))} sub={data.rework.length ? `oldest ${Math.max(...data.rework.map(r => r.oldest_days))} days` : 'none'} tone={data.rework.some(r => r.oldest_days > 5) ? 'amber' : 'slate'} />
            </div>

            {/* Per stage: age buckets */}
            {data.stages.length > 0 && (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {data.stages.map(s => (
                        <button key={s.stage_type_id} type="button" onClick={() => setStage(stage === s.stage_type_id ? '' : s.stage_type_id)} aria-pressed={stage === s.stage_type_id}
                            className={`text-left bg-white border rounded-xl px-4 py-3 ${stage === s.stage_type_id ? 'border-indigo-500 ring-1 ring-indigo-500' : 'border-slate-200 hover:border-slate-300'}`}>
                            <p className="flex items-baseline gap-2"><b className="text-slate-900">{s.stage}</b><span className="text-xs text-slate-500">{s.batches} batch{s.batches === 1 ? '' : 'es'} · oldest {s.oldest_days} d</span></p>
                            <div className="mt-2"><BucketBar buckets={s.buckets} total={s.batches} /></div>
                            <p className="mt-1.5 text-xs text-slate-600">{n0(s.ready)} {s.unit === 'GARMENT' ? 'garments' : 'pieces'} ready · {n0(s.rework)} in rework{s.waiting ? ` · ${s.waiting} waiting to start` : ''}</p>
                        </button>
                    ))}
                </div>
            )}

            <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-bold text-slate-500 mr-1">Days in stage</span>
                {data.buckets.map(b => (
                    <button key={b} type="button" onClick={() => setBucket(bucket === b ? '' : b)} aria-pressed={bucket === b}
                        className={`inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold ${bucket === b ? 'ring-2 ring-indigo-500' : ''}`}>
                        <span className={`h-2 w-2 rounded-full ${BUCKET_CLS[b]}`} />{b} <span className="tabular-nums text-slate-500">{data.batches.filter(x => x.bucket === b).length}</span>
                    </button>
                ))}
                <div className="ml-auto"><SearchInput value={q} onChange={setQ} placeholder="Batch, order, customer, style, line" /></div>
            </div>

            {rows.length === 0 ? (
                <p className="bg-white border border-slate-200 rounded-xl px-4 py-8 text-center text-sm text-slate-500">{data.batches.length ? 'Nothing matches.' : 'No cut batch is in production right now.'}</p>
            ) : (
                <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
                    <table className="w-full text-sm min-w-[900px]">
                        <thead className="bg-slate-50 text-xs font-bold text-slate-500 uppercase tracking-wider">
                            <tr className="text-left"><th className="px-3 py-2.5">Batch</th><th className="px-3 py-2.5">Stage</th><th className="px-3 py-2.5 text-right">Days</th><th className="px-3 py-2.5 text-right">Idle</th>
                                <th className="px-3 py-2.5">Progress here</th><th className="px-3 py-2.5 text-right">Rework</th><th className="px-3 py-2.5">Ship</th></tr>
                        </thead>
                        <tbody>
                            {rows.map(b => (
                                <tr key={`${b.batch_id}-${b.stage_type_id}`} className="border-t border-slate-100 align-top">
                                    <td className="px-3 py-2.5">
                                        <Link to={`/v3/cutting/batches/${b.batch_id}`} className="font-bold text-slate-800 hover:text-indigo-700 hover:underline">{b.batch_code}</Link> <PriorityBadge p={b.priority} />
                                        <span className="block text-xs text-slate-500"><Link to={`/v3/tracker/orders/${b.order_id}`} className="hover:underline">{b.order_no}</Link> · {b.customer_name} · {b.style_code}</span>
                                    </td>
                                    <td className="px-3 py-2.5">
                                        <b className="text-slate-800">{b.stage}</b>
                                        <span className="block text-xs text-slate-500">{b.state === 'WAITING' ? 'waiting to start' : 'in progress'}{b.line_name ? ` · ${b.line_name}` : ''}</span>
                                    </td>
                                    <td className={`px-3 py-2.5 text-right tabular-nums ${BUCKET_TEXT[b.bucket] || ''}`}>{b.days ?? '—'}</td>
                                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-600" title={b.last_check_at ? `Last check ${new Date(b.last_check_at).toLocaleString('en-IN')}` : 'No check yet'}>{b.idle_days ?? '—'}</td>
                                    <td className="px-3 py-2.5 min-w-[220px]">
                                        <div className="flex h-2 w-full overflow-hidden rounded-full bg-slate-100" title={`${b.cleared} cleared · ${b.rework} rework · ${b.rejected} rejected · ${b.ready} ready · ${b.waiting_earlier} not yet cleared earlier`}>
                                            {[[b.cleared, 'bg-emerald-500'], [b.rework, 'bg-amber-400'], [b.rejected, 'bg-rose-500'], [b.ready, 'bg-sky-300']].map(([v, c]) => (v > 0 ? <span key={c} className={c} style={{ width: `${(v / Math.max(b.total, 1)) * 100}%` }} /> : null))}
                                        </div>
                                        <p className="mt-1 text-xs text-slate-600 tabular-nums">{n0(b.cleared)} / {n0(b.total)} cleared · {n0(b.ready)} ready{b.waiting_earlier ? ` · ${n0(b.waiting_earlier)} not cleared earlier` : ''}{b.rejected ? ` · ${n0(b.rejected)} rejected` : ''}</p>
                                    </td>
                                    <td className="px-3 py-2.5 text-right tabular-nums">{b.open_rework ? <span className={b.oldest_rework_days > 5 ? 'font-bold text-amber-700' : ''}>{b.open_rework}<span className="block text-[11px] text-slate-500">oldest {b.oldest_rework_days} d</span></span> : '—'}</td>
                                    <td className="px-3 py-2.5 whitespace-nowrap text-slate-600">{fmtDate(b.ship_date)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {data.rework.length > 0 && (
                <div className="bg-white border border-slate-200 rounded-xl px-4 py-3">
                    <p className="text-xs font-black uppercase tracking-wider text-slate-500 mb-2">Open rework by stage (age since raised)</p>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {data.rework.map(r => (
                            <div key={r.stage_type_id}>
                                <p className="text-sm"><b>{r.stage}</b> <span className="text-slate-500">{r.open} open · oldest {r.oldest_days} d</span></p>
                                <div className="mt-1"><BucketBar buckets={r.buckets} total={r.open} /></div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

// ── Quality ──────────────────────────────────────────────────────────
function MetricRow({ label, sub, m, to }) {
    return (
        <tr className="border-t border-slate-100">
            <td className="px-3 py-2">{to ? <Link to={to} className="font-semibold text-slate-800 hover:text-indigo-700 hover:underline">{label}</Link> : <b className="text-slate-800">{label}</b>}{sub && <span className="block text-xs text-slate-500">{sub}</span>}</td>
            <td className="px-3 py-2 text-right tabular-nums">{n0(m.checked)}</td>
            <td className={`px-3 py-2 text-right tabular-nums font-bold ${m.first_pass_pct == null ? '' : m.first_pass_pct >= 95 ? 'text-emerald-700' : m.first_pass_pct >= 85 ? 'text-amber-700' : 'text-rose-700'}`}>{pctText(m.first_pass_pct)}</td>
            <td className="px-3 py-2 text-right tabular-nums">{n0(m.rework)} <span className="text-xs text-slate-500">{pctText(m.rework_pct)}</span></td>
            <td className={`px-3 py-2 text-right tabular-nums ${m.reject_pct > 2 ? 'font-bold text-rose-700' : ''}`}>{n0(m.rejected)} <span className="text-xs text-slate-500">{pctText(m.reject_pct)}</span></td>
            <td className="px-3 py-2 text-right tabular-nums text-slate-600">{n0(m.repaired)}</td>
        </tr>
    );
}
const MetricHead = ({ first }) => (
    <thead className="bg-slate-50 text-xs font-bold text-slate-500 uppercase tracking-wider">
        <tr><th className="px-3 py-2 text-left">{first}</th><th className="px-3 py-2 text-right">Checked</th><th className="px-3 py-2 text-right" title="Checked for the first time in the period and approved at that first check">First pass</th>
            <th className="px-3 py-2 text-right">Rework</th><th className="px-3 py-2 text-right">Rejected</th><th className="px-3 py-2 text-right">Repaired</th></tr>
    </thead>
);

function QualityTab() {
    const [from, setFrom] = useState(daysAgo(29));
    const [to, setTo] = useState(iso(new Date()));
    const [stage, setStage] = useState('');
    const [data, setData] = useState(null);
    const [error, setError] = useState('');
    const load = useCallback(() => {
        setData(null); setError('');
        insightsApi.quality({ from, to, stage_type_id: stage || undefined }).then(res => setData(res.data)).catch(err => setError(apiError(err, 'Failed to load quality.')));
    }, [from, to, stage]);
    useEffect(() => { load(); }, [load]);
    const quick = (n) => { setFrom(daysAgo(n - 1)); setTo(iso(new Date())); };
    const maxDay = Math.max(1, ...(data?.days || []).map(d => d.checked));
    const maxDefect = Math.max(1, ...(data?.defects || []).map(d => d.n));
    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-end gap-2">
                <label className="text-xs font-bold text-slate-500">From<input type="date" className={`${inputCls} !w-40 mt-0.5`} value={from} max={to} onChange={e => setFrom(e.target.value)} /></label>
                <label className="text-xs font-bold text-slate-500">To<input type="date" className={`${inputCls} !w-40 mt-0.5`} value={to} min={from} onChange={e => setTo(e.target.value)} /></label>
                {[7, 30, 90].map(n => <button key={n} type="button" onClick={() => quick(n)} className="px-2.5 py-2 text-xs font-bold rounded-lg border border-slate-300 bg-white hover:bg-slate-50">{n} days</button>)}
                {data?.stages?.length > 0 && (
                    <label className="text-xs font-bold text-slate-500">Stage
                        <select className={`${inputCls} !w-48 mt-0.5`} value={stage} onChange={e => setStage(e.target.value)}>
                            <option value="">All stages</option>
                            {data.stages.map(s => <option key={s.stage_type_id} value={s.stage_type_id}>{s.stage}</option>)}
                        </select>
                    </label>
                )}
            </div>
            <ErrorBox text={error} />
            {!data ? (!error && <Loading />) : (
                <>
                    <div className="flex flex-wrap gap-3">
                        <Kpi label="Checked" value={n0(data.total.checked)} sub={`${fmtDate(data.from)} – ${fmtDate(data.to)}`} />
                        <Kpi label="First pass" value={pctText(data.total.first_pass_pct)} tone={data.total.first_pass_pct == null ? 'slate' : data.total.first_pass_pct >= 95 ? 'green' : data.total.first_pass_pct >= 85 ? 'amber' : 'red'} sub={`${n0(data.total.first_pass)} of ${n0(data.total.first_checked)} first checks`} />
                        <Kpi label="Rework" value={pctText(data.total.rework_pct)} sub={`${n0(data.total.rework)} units`} tone={data.total.rework_pct > 5 ? 'amber' : 'slate'} />
                        <Kpi label="Rejected" value={pctText(data.total.reject_pct)} sub={`${n0(data.total.rejected)} units`} tone={data.total.reject_pct > 2 ? 'red' : 'slate'} />
                        <Kpi label="Open rework / re-cuts" value={`${n0(data.open_rework)} / ${n0(data.open_recuts)}`} sub={data.open_recuts ? `oldest re-cut ${data.oldest_recut_days} d` : 'no open re-cut'} />
                    </div>
                    {data.total.checked === 0 ? (
                        <p className="bg-white border border-slate-200 rounded-xl px-4 py-8 text-center text-sm text-slate-500">No checks in this period.</p>
                    ) : (
                        <>
                            <div className="grid gap-4 lg:grid-cols-2">
                                <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
                                    <p className="px-3 pt-3 text-xs font-black uppercase tracking-wider text-slate-500">By stage</p>
                                    <table className="w-full text-sm mt-1"><MetricHead first="Stage" /><tbody>{data.stages.map(s => <MetricRow key={s.stage_type_id} label={s.stage} m={s} />)}</tbody></table>
                                </div>
                                <div className="bg-white border border-slate-200 rounded-xl px-3 py-3">
                                    <p className="text-xs font-black uppercase tracking-wider text-slate-500 mb-2">Top defects</p>
                                    {data.defects.length === 0 ? <p className="text-sm text-slate-400">No defects recorded.</p> : data.defects.map(d => (
                                        <div key={`${d.defect_code_id}-${d.stage}-${d.severity}`} className="mb-1.5">
                                            <p className="text-xs flex gap-2"><b className="text-slate-800">{d.code}</b><span className="truncate text-slate-600">{d.description}</span><span className="ml-auto shrink-0 text-slate-500">{d.stage} · {d.severity === 'QC_REJECTED' ? 'reject' : 'rework'}</span><b className="tabular-nums">{d.n}</b></p>
                                            <div className="h-1.5 rounded-full bg-slate-100"><div className={`h-1.5 rounded-full ${d.severity === 'QC_REJECTED' ? 'bg-rose-500' : 'bg-amber-400'}`} style={{ width: `${(d.n / maxDefect) * 100}%` }} /></div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div className="bg-white border border-slate-200 rounded-xl px-3 py-3">
                                <p className="text-xs font-black uppercase tracking-wider text-slate-500 mb-2">Per day — checked, with rework (amber) and rejects (red)</p>
                                <div className="flex items-end gap-1 h-32 overflow-x-auto">
                                    {data.days.map(d => (
                                        <div key={d.day} className="flex flex-col items-center min-w-[22px]" title={`${fmtDate(d.day)}: ${d.checked} checked, ${d.rework} rework, ${d.rejected} rejected`}>
                                            <div className="w-4 flex flex-col-reverse rounded-t bg-sky-200" style={{ height: `${(d.checked / maxDay) * 100}px` }}>
                                                <div className="bg-rose-500" style={{ height: `${(d.rejected / Math.max(d.checked, 1)) * 100}%` }} />
                                                <div className="bg-amber-400" style={{ height: `${(d.rework / Math.max(d.checked, 1)) * 100}%` }} />
                                            </div>
                                            <span className="text-[9px] text-slate-500 mt-0.5">{d.day.slice(8)}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div className="grid gap-4 lg:grid-cols-2">
                                <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
                                    <p className="px-3 pt-3 text-xs font-black uppercase tracking-wider text-slate-500">By line (highest reject % first)</p>
                                    <table className="w-full text-sm mt-1"><MetricHead first="Line" /><tbody>{data.lines.map(l => <MetricRow key={`${l.stage_type_id}-${l.line_id}`} label={l.line_name} sub={l.stage} m={l} />)}</tbody></table>
                                </div>
                                <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
                                    <p className="px-3 pt-3 text-xs font-black uppercase tracking-wider text-slate-500">By order</p>
                                    <table className="w-full text-sm mt-1"><MetricHead first="Order" /><tbody>{data.orders.map(o => <MetricRow key={o.order_id} label={o.order_no} to={`/v3/tracker/orders/${o.order_id}`} m={o} />)}</tbody></table>
                                </div>
                            </div>
                        </>
                    )}
                </>
            )}
        </div>
    );
}

// ── Cost ─────────────────────────────────────────────────────────────
function CostTab() {
    const [rows, setRows] = useState(null);
    const [error, setError] = useState('');
    const [q, setQ] = useState('');
    useEffect(() => {
        const t = setTimeout(() => insightsApi.costs({ q: q.trim() || undefined }).then(res => setRows(res.data)).catch(err => setError(apiError(err, 'Failed to load costs.'))), 250);
        return () => clearTimeout(t);
    }, [q]);
    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm text-slate-600">Material issued to production (net of returns) × rate, against the Order BOM requirement × rate. Ex-GST.</p>
                <div className="ml-auto"><SearchInput value={q} onChange={setQ} placeholder="Order, customer, buyer PO" /></div>
            </div>
            <ErrorBox text={error} />
            {!rows ? (!error && <Loading />) : rows.length === 0 ? <p className="bg-white border border-slate-200 rounded-xl px-4 py-8 text-center text-sm text-slate-500">No approved order.</p> : (
                <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
                    <table className="w-full text-sm min-w-[880px]">
                        <thead className="bg-slate-50 text-xs font-bold text-slate-500 uppercase tracking-wider">
                            <tr className="text-left"><th className="px-3 py-2.5">Order</th><th className="px-3 py-2.5 text-right">Ordered · cut</th><th className="px-3 py-2.5 text-right">Planned</th>
                                <th className="px-3 py-2.5 text-right">Issued so far</th><th className="px-3 py-2.5">Fabric · trims</th><th className="px-3 py-2.5 text-right">Per garment cut</th><th className="px-3 py-2.5" /></tr>
                        </thead>
                        <tbody>
                            {rows.map(r => (
                                <tr key={r.id} className="border-t border-slate-100 align-top">
                                    <td className="px-3 py-2.5"><Link to={`/v3/insights/cost/${r.id}`} className="font-bold text-slate-800 hover:text-indigo-700 hover:underline">{r.order_no}</Link>
                                        <span className="block text-xs text-slate-500">{r.customer_name}{r.buyer_po_no ? ` · PO ${r.buyer_po_no}` : ''}{r.ship_date ? ` · ship ${fmtDate(r.ship_date)}` : ''}</span></td>
                                    <td className="px-3 py-2.5 text-right tabular-nums">{n0(r.ordered)} · {n0(r.cut)}</td>
                                    <td className="px-3 py-2.5 text-right tabular-nums">{money(r.planned_cost)}<span className="block text-[11px] text-slate-500">{r.planned_per_garment != null ? `${money(r.planned_per_garment)} / garment` : ''}</span></td>
                                    <td className="px-3 py-2.5 text-right tabular-nums font-bold">{money(r.actual_cost)}{r.planned_cost > 0 && <span className="block text-[11px] font-normal text-slate-500">{Math.round((r.actual_cost / r.planned_cost) * 100)}% of planned</span>}</td>
                                    <td className="px-3 py-2.5 text-xs text-slate-600 tabular-nums">{money(r.fabric_actual)} · {money(r.trims_actual)}{r.recut_cost > 0 && <span className="block text-rose-700">re-cuts {money(r.recut_cost)}</span>}</td>
                                    <td className="px-3 py-2.5 text-right tabular-nums">{money(r.per_garment_cut)}</td>
                                    <td className="px-3 py-2.5">{r.unpriced_items > 0 && <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-800 bg-amber-50 border border-amber-200 rounded px-1.5" title="No GRN or PO rate for these items — their cost is not counted"><AlertTriangle size={11} /> {r.unpriced_items} without rate</span>}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

const TABS = [['wip', 'WIP ageing', Hourglass], ['quality', 'Quality', ShieldCheck], ['cost', 'Cost per order', IndianRupee]];

export default function InsightsPage() {
    const { me } = useV3Access();
    const canCost = Boolean(me?.menu?.['production.insightsCost']);
    const [params, setParams] = useSearchParams();
    const tabs = TABS.filter(([k]) => k !== 'cost' || canCost);
    const tab = tabs.some(([k]) => k === params.get('tab')) ? params.get('tab') : 'wip';
    return (
        <div>
            <PageHeader title="Production insights" subtitle="How long batches sit at each stage, quality by stage, line and order, and material cost per order. Read only." />
            <div className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5 mb-4" role="tablist">
                {tabs.map(([k, label, Icon]) => (
                    <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setParams({ tab: k }, { replace: true })}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-bold rounded-md ${tab === k ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:text-slate-900'}`}><Icon size={14} /> {label}</button>
                ))}
            </div>
            {tab === 'wip' && <WipTab />}
            {tab === 'quality' && <QualityTab />}
            {tab === 'cost' && canCost && <CostTab />}
        </div>
    );
}

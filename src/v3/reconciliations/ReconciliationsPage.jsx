// Reconciliations (20 Oct 2026, phase 6): fabric per order (cutting manager), production stage per batch × stage (floor
// in-charge), trims per batch kit (store manager). Each generator sees what they can generate with its latest report;
// the merchandiser approves, accounts acknowledges. The latest run of each counts; older runs stay on record.
// 21 Oct 2026: Outdated (generate again) and Provisional shown on each report.
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { FileCheck } from 'lucide-react';
import { reconciliationsApi } from '../api/reconciliationsApi';
import { apiError } from '../api/mastersApi';
import { PageHeader, PrimaryButton, ErrorBox, Loading } from '../components/ui';
import { useV3Live } from '../live';
import { KIND, StatusChip, ProvisionalChip, money, scopeOf } from './recShared';

const TABS = [['WAITING', 'Waiting for approval'], ['UNACKNOWLEDGED', 'To acknowledge'], ['SENT_BACK', 'Sent back'], ['APPROVED', 'Approved'], ['', 'All']];

function Generate({ kind, onDone }) {
    const [rows, setRows] = useState(null);
    const [busy, setBusy] = useState(null);
    const [error, setError] = useState('');
    useEffect(() => { reconciliationsApi.candidates(kind).then(r => setRows(r.data)).catch(err => setError(apiError(err, 'Failed to load.'))); }, [kind]);
    const go = async (key, body) => {
        setBusy(key); setError('');
        try { const r = await reconciliationsApi.generate({ kind, ...body }); onDone(r.data); } catch (err) { setError(apiError(err, 'Failed to generate.')); setBusy(null); }
    };
    const latest = (x) => (x.latest ? <span className="text-xs text-slate-500">run {x.latest.run_no} · {new Date(x.latest.at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} · <b className={x.latest.outdated ? 'text-rose-700' : ''}>{x.latest.outdated ? 'outdated — generate again' : x.latest.status.toLowerCase().replace('_', ' ')}</b></span> : <span className="text-xs text-slate-400">no report yet</span>);
    const title = { FABRIC: 'Fabric reconciliation — per order (when it is cut)', STAGE: 'Stage reconciliation — per batch × stage (when the stage is complete)', TRIM: 'Trim reconciliation — per batch kit (handed over)' }[kind];
    return (
        <div className="bg-white border border-slate-200 rounded-xl mb-4">
            <p className="px-4 py-2.5 border-b border-slate-100 font-black text-slate-800 flex items-center gap-2"><FileCheck size={16} className="text-indigo-600" />{title}</p>
            <ErrorBox text={error} />
            {!rows ? <div className="p-3"><Loading /></div> : rows.length === 0 ? <p className="px-4 py-4 text-sm text-slate-400">Nothing to reconcile yet.</p> : (
                <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto">{rows.map(x => {
                    const key = kind === 'FABRIC' ? x.order_id : kind === 'STAGE' ? `${x.batch_id}|${x.stage_type_id}` : x.kit_id;
                    const body = kind === 'FABRIC' ? { order_id: x.order_id } : kind === 'STAGE' ? { batch_id: x.batch_id, stage_type_id: x.stage_type_id } : { kit_id: x.kit_id };
                    return (
                        <div key={key} className="flex flex-wrap items-center gap-3 px-4 py-2 text-sm">
                            {kind === 'FABRIC' && <span><b>{x.order_no}</b> <span className="text-xs text-slate-500">{x.customer_name} · {x.batches_cut} batch(es) cut{x.batches_open ? ` · ${x.batches_open} still being cut` : ''}</span></span>}
                            {kind === 'STAGE' && <span><b>#{x.floor_no}</b> {x.stage} <span className="text-xs text-slate-500">{x.order_no} · completed {x.completed_at ? new Date(x.completed_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : ''}</span></span>}
                            {kind === 'TRIM' && <span><b>{x.kit_no}</b> <span className="text-xs text-slate-500">{x.floor_no ? `#${x.floor_no} · ` : ''}{x.order_no} · kit {x.kit_status.toLowerCase().replace('_', ' ')}</span></span>}
                            <span className="ml-auto">{latest(x)}</span>
                            {x.latest && <Link to={`/v3/reconciliations/${x.latest.id}`} className="text-xs font-bold text-indigo-700 hover:underline">Open</Link>}
                            <PrimaryButton busy={busy === key} disabled={Boolean(busy)} onClick={() => go(key, body)}>{x.latest ? 'Generate again' : 'Generate'}</PrimaryButton>
                        </div>
                    );
                })}</div>
            )}
        </div>
    );
}

export default function ReconciliationsPage() {
    const navigate = useNavigate();
    const [params, setParams] = useSearchParams();
    const [perm, setPerm] = useState(null);
    const [rows, setRows] = useState(null);
    const [error, setError] = useState('');
    const status = params.get('status') ?? '';
    const kind = params.get('kind') || '';
    const load = useCallback(() => reconciliationsApi.list({ status: status || undefined, kind: kind || undefined }).then(r => setRows(r.data)).catch(err => setError(apiError(err, 'Failed to load.'))), [status, kind]);
    useEffect(() => { load(); reconciliationsApi.permissions().then(r => setPerm(r.data)).catch(() => setPerm({ generate: {} })); }, [load]);
    useV3Live(load);
    const set = (k, v) => { const p = new URLSearchParams(params); if (v) p.set(k, v); else p.delete(k); setParams(p); };
    const gens = perm ? Object.entries(perm.generate || {}).filter(([, ok]) => ok).map(([k]) => k) : [];
    return (
        <div>
            <PageHeader title="Reconciliations" subtitle="Fabric per order, each production stage per batch, trims per batch. Generated by whoever runs that part; the merchandiser approves; accounts acknowledges every report." />
            {gens.filter(g => !kind || g === kind).map(g => <Generate key={g} kind={g} onDone={(r) => navigate(`/v3/reconciliations/${r.id}`)} />)}
            <div className="flex flex-wrap items-center gap-1 mb-3 border-b border-slate-200">
                {TABS.map(([k, label]) => (
                    <button key={label} type="button" onClick={() => set('status', k)} className={`px-3 py-2 text-sm font-bold border-b-2 -mb-px ${status === k ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>{label}</button>
                ))}
                <select className="ml-auto mb-1 px-3 py-1.5 text-sm border border-slate-300 rounded-lg" value={kind} onChange={e => set('kind', e.target.value)} aria-label="Kind">
                    <option value="">Every kind</option>{Object.entries(KIND).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
            </div>
            <ErrorBox text={error} />
            {!rows ? <Loading /> : rows.length === 0 ? <p className="text-sm text-slate-500 bg-white border border-slate-200 rounded-xl p-6 text-center">No reports here.</p> : (
                <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
                    {rows.map(r => (
                        <Link key={r.id} to={`/v3/reconciliations/${r.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 hover:bg-slate-50">
                            <span className="text-xs font-black uppercase tracking-wider text-slate-500 w-32">{KIND[r.kind]}</span>
                            <b className="text-slate-900">{scopeOf(r)}</b>
                            <StatusChip r={r} />
                            {!r.outdated_at && <ProvisionalChip n={r.provisional_n} />}
                            {r.acknowledged_at ? <span className="text-[11px] font-bold text-emerald-700">acknowledged</span> : <span className="text-[11px] font-bold text-slate-400">not acknowledged</span>}
                            <span className="basis-full text-xs text-slate-600">{r.summary}</span>
                            <span className="text-xs text-slate-500">run {r.run_no} · {r.generated_by_name || '—'} · {new Date(r.generated_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                            {(r.writeoff_value || r.overrun_value) ? <span className="ml-auto text-xs text-slate-600">{r.writeoff_value ? `written off ${money(r.writeoff_value)}` : ''}{r.overrun_value ? ` · over BOM ${money(r.overrun_value)}` : ''}</span> : null}
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
}

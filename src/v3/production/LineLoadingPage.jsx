// Line loading: the line loader loads a finalised batch's sizes for a stage
// (after the first) onto a 2.0 line of that stage (WIP limit from 2.0). A
// size loads only when its pieces (garments, at garment stages) are cleared at the earlier stages. One line
// per batch × stage; a manager can move it with a reason. Loads complete by
// themselves when all their pieces are final at the stage.
import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Truck, ArrowRightLeft } from 'lucide-react';
import Modal from '../../shared/Modal';
import { productionApi } from '../api/productionApi';
import { apiError } from '../api/mastersApi';
import { PageHeader, Field, inputCls, PrimaryButton, SecondaryButton, ErrorBox, Loading } from '../components/ui';
import { fmtDate } from '../salesOrders/SalesOrderStatusBadge';

export default function LineLoadingPage() {
    const [perms, setPerms] = useState({});
    const [stages, setStages] = useState([]);
    const [stageId, setStageId] = useState('');
    const [params] = useSearchParams();
    const focusStage = params.get('stage'), focusBatch = params.get('batch');   // from the order tracker
    const [lines, setLines] = useState([]);
    const [rows, setRows] = useState(null);
    const [pick, setPick] = useState({});      // batch id → { line, sizes: Set }
    const [move, setMove] = useState(null);
    const [error, setError] = useState('');
    const [msg, setMsg] = useState('');
    const [busy, setBusy] = useState(false);
    useEffect(() => {
        productionApi.permissions().then(res => setPerms(res.data)).catch(() => {});
        productionApi.station().then(res => {
            const st = res.data.stages.filter(x => x.name !== 'Cutting');
            setStages(st); const f = st.find(x => String(x.id) === focusStage) || st[0]; if (f) setStageId(f.id);
        }).catch(err => setError(apiError(err, 'Failed to load stages.')));
    }, [focusStage]);
    const load = useCallback(() => {
        if (!stageId) return;
        productionApi.lines(stageId).then(res => setLines(res.data)).catch(() => setLines([]));
        productionApi.loading(stageId).then(res => setRows(res.data)).catch(err => setError(apiError(err, 'Failed to load batches.')));
    }, [stageId]);
    useEffect(() => { setRows(null); setPick({}); load(); }, [load]);
    const doLoad = async (bt) => {
        const p = pick[bt.id] || {};
        setBusy(true); setError(''); setMsg('');
        try {
            const res = await productionApi.load({ batch_id: bt.id, stage_type_id: stageId, production_line_id: p.line || bt.sizes.find(x => x.load?.status === 'OPEN')?.load.line_id, size_ids: p.sizes?.size ? [...p.sizes] : undefined });
            setMsg(`${res.data.batch}: size ${res.data.sizes.join(', ')} loaded onto ${res.data.line}.`); load();
        } catch (err) { setError(apiError(err, 'Failed to load.')); } finally { setBusy(false); }
    };
    const toggleSize = (bt, sid) => setPick(x => { const cur = x[bt.id] || {}; const set = new Set(cur.sizes || []); if (set.has(sid)) set.delete(sid); else set.add(sid); return { ...x, [bt.id]: { ...cur, sizes: set } }; });
    return (
        <div>
            <PageHeader title="Line loading" subtitle="Load cut batches onto lines, size by size. A size loads only when its pieces are cleared at the earlier stages; the line's WIP limit (2.0) applies."
                actions={<select className="px-3 py-2 text-sm border border-slate-300 rounded-lg" value={stageId} onChange={e => setStageId(e.target.value)} aria-label="Stage">{stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select>} />
            <div className="flex flex-wrap gap-2 mb-3">{lines.map(l => (
                <span key={l.id} className={`text-xs px-2 py-1 rounded border ${l.wip_limit != null && l.open_batches >= l.wip_limit ? 'bg-rose-50 border-rose-300 text-rose-800' : 'bg-white border-slate-200 text-slate-700'}`}>{l.name}: {l.open_batches}{l.wip_limit != null ? ` / ${l.wip_limit}` : ''} batches</span>
            ))}</div>
            <ErrorBox text={error} />
            {msg && <p className="mb-3 text-sm text-emerald-700">{msg}</p>}
            {!rows ? <Loading /> : rows.length === 0 ? <p className="text-sm text-slate-400">No batch waiting for this stage.</p> : (
                <div className="space-y-3">{(focusBatch ? [...rows].sort((a, b) => (b.id === focusBatch) - (a.id === focusBatch)) : rows).map(bt => {
                    const p = pick[bt.id] || {};
                    const openLine = bt.sizes.find(x => x.load?.status === 'OPEN')?.load;
                    return (
                        <div key={bt.id} className={`bg-white border rounded-xl p-4 ${bt.id === focusBatch ? 'border-indigo-400 ring-2 ring-indigo-200' : 'border-slate-200'}`}>
                            <div className="flex flex-wrap items-center gap-2 mb-2">
                                <Link to={`/v3/cutting/batches/${bt.id}`} className="font-bold text-indigo-700 hover:underline">{bt.batch_code}</Link>
                                <span className="text-xs text-slate-500">{bt.style_code} · {bt.customer_name} · ships {fmtDate(bt.ship_date)}</span>
                                {openLine && <span className="text-xs font-semibold text-indigo-700">on {openLine.line}</span>}
                                {perms.changeLine && openLine && <button type="button" className="ml-auto text-xs font-semibold text-slate-600 hover:underline inline-flex items-center gap-1" onClick={() => setMove({ bt, line: '', reason: '' })}><ArrowRightLeft size={12} /> Change line</button>}
                            </div>
                            <div className="flex flex-wrap gap-2 mb-2">{bt.sizes.map(z => (
                                <label key={z.size_id} className={`text-xs px-2 py-1 rounded border ${z.load ? (z.load.status === 'COMPLETED' ? 'bg-emerald-50 border-emerald-300' : 'bg-indigo-50 border-indigo-300') : z.ready ? 'bg-white border-slate-300 cursor-pointer' : 'bg-slate-50 border-slate-200 text-slate-400'}`}>
                                    {!z.load && z.ready && perms.load && <input type="checkbox" className="mr-1" checked={Boolean(p.sizes?.has(z.size_id))} onChange={() => toggleSize(bt, z.size_id)} />}
                                    <b>{z.size}</b> {z.pieces} pcs · {z.load ? `${z.load.status === 'COMPLETED' ? 'done' : 'loaded'} (${z.load.line})` : z.ready ? 'ready' : `${z.waiting} waiting earlier stage`}
                                </label>
                            ))}</div>
                            {bt.trims.length > 0 && <p className="text-xs text-slate-500 mb-2">Trims issued for this batch: {bt.trims.map(t => `${t.issue_no} (${t.stage}, ${t.lines} items)`).join(' · ')}</p>}
                            {perms.load && bt.sizes.some(z => !z.load && z.ready) && (
                                <div className="flex flex-wrap items-end gap-2">
                                    {!openLine && <div className="w-56"><Field label="Line"><select className={inputCls} value={p.line || ''} onChange={e => setPick({ ...pick, [bt.id]: { ...p, line: e.target.value } })}><option value="">Choose…</option>{lines.map(l => <option key={l.id} value={l.id} disabled={l.wip_limit != null && l.open_batches >= l.wip_limit}>{l.name} ({l.open_batches}{l.wip_limit != null ? `/${l.wip_limit}` : ''})</option>)}</select></Field></div>}
                                    <PrimaryButton onClick={() => doLoad(bt)} busy={busy} disabled={busy || (!openLine && !p.line)}><Truck size={14} /> Load {p.sizes?.size ? `${p.sizes.size} size(s)` : 'all ready sizes'}</PrimaryButton>
                                </div>
                            )}
                        </div>
                    );
                })}</div>
            )}
            {move && (
                <Modal title={`Move ${move.bt.batch_code}`} onClose={() => setMove(null)}>
                    <div className="space-y-3 w-[min(420px,85vw)]">
                        <Field label="New line"><select className={inputCls} value={move.line} onChange={e => setMove({ ...move, line: e.target.value })}><option value="">Choose…</option>{lines.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select></Field>
                        <Field label="Reason *"><input className={inputCls} value={move.reason} onChange={e => setMove({ ...move, reason: e.target.value })} /></Field>
                        <div className="flex justify-end gap-2"><SecondaryButton onClick={() => setMove(null)}>Back</SecondaryButton>
                            <PrimaryButton busy={busy} disabled={busy || !move.line || !move.reason.trim()} onClick={async () => { setBusy(true); setError(''); try { await productionApi.changeLine({ batch_id: move.bt.id, stage_type_id: stageId, production_line_id: move.line, reason: move.reason }); setMove(null); load(); } catch (err) { setError(apiError(err, 'Failed.')); } finally { setBusy(false); } }}>Move</PrimaryButton></div>
                    </div>
                </Modal>
            )}
        </div>
    );
}

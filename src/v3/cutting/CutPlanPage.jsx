// Cut plan for an order line (rebuilt 8 Nov 2026, owner: "planner manually define marker ratio and length is auto
// calculated, then planner select rolls for marker it calculate endbits and lays, and Target table is updated with
// available fabric — this planner is visualisation before execution"). Backend: controllers/v3/cutPlansController.js,
// arithmetic controllers/v3/cutPlanner.js.
//   Target: per colour × size the order + the plan's allowance against cut / on batches + planned, with the fabric still
//           free per colour and about how many garments it gives.
//   Lays:   one marker each — the planner's size ratio; its length = Σ ratio × the BOM's fabric per garment (all-in, so a
//           ply is the marker). The planner ticks rolls / end bits / the ends earlier lays leave; each shows the plies it
//           gives, the metres used and the end bit left. "Create batch" turns a lay into a cut batch.
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Plus, Save, Scissors, Trash2, Pencil, X, AlertTriangle, Layers, ChevronDown, ChevronRight, RotateCcw } from 'lucide-react';
import { cuttingApi } from '../api/cuttingApi';
import { apiError } from '../api/mastersApi';
import { PageHeader, inputCls, PrimaryButton, SecondaryButton, ErrorBox, Loading } from '../components/ui';
import { fmtDate } from '../salesOrders/SalesOrderStatusBadge';
import { CUT_STATUS, LEN_PER_IN, fmt } from './cutShared';

const qtyText = (o) => Object.entries(o || {}).filter(([, v]) => v).map(([u, v]) => `${fmt(v, 2)} ${u}`).join(' + ') || '—';
const addQty = (list, pick) => list.reduce((a, x) => { const v = pick(x); if (v != null && x.uom) a[x.uom] = (a[x.uom] || 0) + v; return a; }, {});
const inText = (inches) => (inches ? `${fmt(inches, 2)} in (${fmt(inches * LEN_PER_IN.m, 2)} m)` : '—');
const markerOf = (ratio, colourIds, d) => {
    const ids = colourIds.length ? colourIds : d.colours.slice(0, 1).map(c => c.id);
    const lens = ids.map(cid => {
        const per = d.length_per_size[cid] || {};
        let v = 0;
        for (const [sid, n] of Object.entries(ratio)) { if (!Number(n)) continue; if (!per[sid]) return null; v += Number(n) * per[sid]; }
        return v ? Math.round(v * 100) / 100 : null;
    }).filter(Boolean);
    return lens.length ? Math.max(...lens) : null;
};
const pliesOf = (piece, marker) => (marker && LEN_PER_IN[piece.uom] ? Math.floor(piece.length / (marker * LEN_PER_IN[piece.uom]) + 1e-9) : null);

export default function CutPlanPage() {
    const { lineId } = useParams();
    const navigate = useNavigate();
    const [d, setD] = useState(null);
    const [error, setError] = useState('');
    const [msg, setMsg] = useState('');
    const [busy, setBusy] = useState(false);
    const [allowance, setAllowance] = useState('');
    const [adding, setAdding] = useState(false);
    const [showHistory, setShowHistory] = useState(false);
    const take = (data) => { setD(data); setAllowance(String(data.allowance_pct)); };
    useEffect(() => { cuttingApi.plan(lineId).then(res => take(res.data)).catch(err => setError(apiError(err, 'Failed to load the cut plan.'))); }, [lineId]);
    const run = async (fn, done) => {
        setBusy(true); setError(''); setMsg('');
        try { const res = await fn(); if (res?.data?.lays) take(res.data); if (done) done(res?.data); }
        catch (err) { setError(apiError(err, 'Failed to save.')); }
        finally { setBusy(false); }
    };
    const sizeName = useMemo(() => new Map((d?.sizes || []).map(s => [s.id, s.name])), [d]);
    const colourName = useMemo(() => new Map((d?.colours || []).map(c => [c.id, c.name])), [d]);
    if (!d) return <div>{error ? <ErrorBox text={error} /> : <Loading />}</div>;
    const can = d.can.manage;
    const layWarnings = (no) => d.warnings.filter(w => w.startsWith(`Lay ${no}:`));
    const general = d.warnings.filter(w => !/^Lay \d+:/.test(w));
    const open = d.lays.filter(l => !l.batch);
    return (
        <div>
            <Link to="/v3/cutting" className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-indigo-600 mb-3"><ArrowLeft size={15} /> Cutting</Link>
            <PageHeader title={`Cut plan — ${d.line.order_no} line ${d.line.line_no}`} subtitle={`${d.line.customer_name} · ${d.line.style_code} ${d.line.style_name} · ships ${fmtDate(d.line.ship_date)}`}
                actions={<div className="flex flex-wrap gap-2">
                    <Link to={`/v3/cutting/orders/${d.line.order_id}/roll-groups`} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold border border-slate-300 rounded-lg hover:border-indigo-400"><Layers size={15} /> Group rolls</Link>
                    {can && <Link to={`/v3/cutting/lines/${lineId}/new`} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold border border-slate-300 rounded-lg hover:border-indigo-400">Batch without plan</Link>}
                </div>} />
            <div className={`mb-3 text-sm rounded-lg px-3 py-2 border ${d.cutting_gate.allowed ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-rose-50 border-rose-200 text-rose-900'}`}><b>Cutting gate:</b> {d.cutting_gate.allowed ? (d.cutting_gate.ready ? 'open — all materials covered.' : `open by override — ${d.cutting_gate.reason}`) : `closed — ${d.cutting_gate.reason}`}</div>
            {d.notes.map(n => <p key={n} className="mb-3 text-sm rounded-lg bg-amber-50 border border-amber-200 text-amber-900 px-3 py-2">{n}</p>)}
            <ErrorBox text={error} />
            {msg && <p className="mb-3 text-sm rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 px-3 py-2">{msg}</p>}

            <TargetTable d={d} can={can} busy={busy} allowance={allowance} setAllowance={setAllowance} colourName={colourName}
                onSaveAllowance={() => run(() => cuttingApi.savePlan(lineId, { allowance_pct: Number(allowance) }), () => setMsg('Allowance saved — the target is updated.'))} />

            <div className="flex flex-wrap items-center gap-2 mb-3">
                <h2 className="font-bold text-slate-800 mr-2">Markers and lays</h2>
                {can && !adding && <PrimaryButton disabled={busy} onClick={() => setAdding(true)}><Plus size={15} /> New marker</PrimaryButton>}
                {can && (open.length > 0 || d.allowance_pct !== d.order_allowance_pct) && <SecondaryButton disabled={busy} onClick={() => {
                    const kept = d.lays.length - open.length;
                    if (window.confirm(`Reset the whole plan?\n\n${open.length} lay${open.length === 1 ? '' : 's'} not yet a batch will be removed and the cut allowance goes back to the order's ${d.order_allowance_pct}%.${kept ? `\n${kept} lay${kept === 1 ? ' that is a batch stays' : 's that are batches stay'} (change those batches themselves).` : ''}`)) {
                        run(() => cuttingApi.resetPlan(lineId), () => { setAdding(false); setMsg('Plan reset — start again with a new marker.'); });
                    }
                }}><RotateCcw size={15} /> Reset plan</SecondaryButton>}
                <span className="ml-auto text-xs text-slate-500">{d.lays.length} lay{d.lays.length === 1 ? '' : 's'} ({open.length} planned, {d.lays.length - open.length} batches) · {open.reduce((s, l) => s + l.plies, 0)} plies · {open.reduce((s, l) => s + l.garment_count, 0)} garments planned · {qtyText(addQty(open.flatMap(l => Object.entries(l.fabric).map(([uom, v]) => ({ uom, v }))), x => x.v))} fabric</span>
            </div>
            {general.length > 0 && (
                <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    {general.map(w => <p key={w} className="flex items-start gap-1.5"><AlertTriangle size={14} className="mt-0.5 shrink-0" /> {w}</p>)}
                </div>
            )}
            {d.lays.length === 0 && !adding && <p className="mb-4 text-sm text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-6 text-center">No lays yet. {can ? 'Add a marker: its size ratio, then tick the rolls to lay it on.' : ''}</p>}
            <div className="space-y-3 mb-4">
                {d.lays.map(l => <LayCard key={l.id} lay={l} d={d} can={can} busy={busy} warnings={layWarnings(l.lay_no)} sizeName={sizeName} colourName={colourName}
                    onSave={(body) => run(() => cuttingApi.updatePlanLay(l.id, body))}
                    onRemove={() => { if (window.confirm(`Remove lay ${l.lay_no}?${d.lays.some(x => x.rolls.some(y => y.tail_of_lay_no === l.lay_no)) ? ' A later lay uses an end it leaves.' : ''}`)) run(() => cuttingApi.removePlanLay(l.id)); }}
                    onBatch={(mode) => run(() => cuttingApi.batchFromLay(l.id, { numbering_mode: mode }), (b) => navigate(`/v3/cutting/batches/${b.id}`))} />)}
                {adding && <LayCard lay={null} d={d} can={can} busy={busy} warnings={[]} sizeName={sizeName} colourName={colourName}
                    onSave={(body) => run(() => cuttingApi.addPlanLay(lineId, body), () => setAdding(false))} onCancel={() => setAdding(false)} />}
            </div>

            {d.history.length > 0 && (
                <section className="bg-white border border-slate-200 rounded-xl p-4">
                    <button type="button" className="flex items-center gap-1 font-bold text-slate-800" onClick={() => setShowHistory(v => !v)}>{showHistory ? <ChevronDown size={16} /> : <ChevronRight size={16} />} History</button>
                    {showHistory && <div className="mt-2 divide-y divide-slate-100 text-sm">{d.history.map((h, i) => (
                        <div key={i} className="py-2"><span className="text-xs text-slate-500">{new Date(h.created_at).toLocaleString('en-IN')} · {h.user_name || '—'}</span>
                            <ul className="list-disc ml-5">{(h.detail?.summary || []).map((s, j) => <li key={j}>{s}</li>)}</ul></div>
                    ))}</div>}
                </section>
            )}
        </div>
    );
}

// Target per colour × size: (cut / on batches + planned) / target, the order under it; the fabric still free per colour.
function TargetTable({ d, can, busy, allowance, setAllowance, colourName, onSaveAllowance }) {
    const sizes = d.sizes.filter(s => d.cells.some(x => x.size_id === s.id));
    const colourIds = [...new Set(d.cells.map(x => x.colour_id))];
    const cell = (cid, sid) => d.cells.find(x => x.colour_id === cid && x.size_id === sid);
    // Gap per size (short of the order / over the target); a total adds the sizes' gaps, so one size's over doesn't hide another's short.
    const gapOf = (x) => ({ short: Math.max(0, x.ordered - x.covered - x.planned), over: Math.max(0, x.covered + x.planned - x.target) });
    const total = (list) => list.reduce((a, x) => ({ target: a.target + x.target, covered: a.covered + x.covered, planned: a.planned + x.planned, ordered: a.ordered + x.ordered,
        short: a.short + gapOf(x).short, over: a.over + gapOf(x).over, anyShort: a.anyShort || x.covered + x.planned < x.ordered }), { target: 0, covered: 0, planned: 0, ordered: 0, short: 0, over: 0, anyShort: false });
    // Red: below the order (a total: any size below) · amber: above the target · green: order covered, up to the target.
    const tone = (t) => (!t.target && !t.covered && !t.planned ? '' : t.anyShort || t.covered + t.planned < t.ordered ? 'bg-rose-50 text-rose-800' : t.covered + t.planned > t.target ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-800');
    // (cut + planned) / target, then the gap: "−n to order", "✓" or "+n over"; "n cut + n plan" only when both are there.
    const Cell = ({ t, strong }) => {
        const g = t.short !== undefined ? t : gapOf(t);
        const gap = [g.short > 0 && `−${g.short} to order`, g.over > 0 && `+${g.over} over`].filter(Boolean);
        return (
            <td className={`px-2 py-1.5 text-center tabular-nums ${tone(t)} ${strong ? 'font-bold' : ''}`}>
                <span className="font-bold">{t.covered + t.planned}</span><span className="text-slate-500"> / {t.target}</span>
                {(t.target > 0 || t.covered + t.planned > 0) && (gap.length ? gap.map(x => <span key={x} className="block text-[11px] font-semibold whitespace-nowrap">{x}</span>) : <span className="block text-[11px] font-semibold">✓</span>)}
                {t.covered > 0 && t.planned > 0 && <span className="block text-[10px] font-normal text-slate-500 whitespace-nowrap">{t.covered} cut + {t.planned} plan</span>}
            </td>
        );
    };
    const fab = (cid) => d.fabric.find(f => f.colour_id === cid);
    const allFree = d.fabric.reduce((a, f) => { for (const [u, v] of Object.entries(f.free)) a[u] = (a[u] || 0) + v; return a; }, {});
    const changed = Number(allowance) !== d.allowance_pct;
    return (
        <section className="bg-white border border-slate-200 rounded-xl mb-4 overflow-x-auto">
            <div className="px-4 pt-3 pb-2 flex flex-wrap items-center gap-x-3 gap-y-2">
                <h2 className="font-bold text-slate-800">Target</h2>
                <span className="text-xs text-slate-500">Cut or on batches + planned / order + {d.allowance_pct}% (order's own {d.order_allowance_pct}%). Red: below the order · green: order covered, up to the target · amber: above the target.</span>
                {can && <span className="ml-auto flex items-center gap-1.5 text-xs font-bold text-slate-600">Allowance %
                    <input className={`${inputCls} !w-20 !py-1`} type="number" min="0" max="50" step="0.5" value={allowance} onChange={e => setAllowance(e.target.value)} aria-label="Cut allowance %" />
                    {changed && <SecondaryButton disabled={busy} onClick={onSaveAllowance}><Save size={14} /> Save</SecondaryButton>}</span>}
            </div>
            <table className="w-full text-sm min-w-[760px]">
                <thead className="bg-slate-50 text-xs font-bold text-slate-500 uppercase tracking-wider"><tr><th className="px-3 py-2 text-left">Colour</th>{sizes.map(s => <th key={s.id} className="px-2 py-2 text-center">{s.name}</th>)}<th className="px-2 py-2 text-center">Total</th><th className="px-3 py-2 text-right">Fabric free</th><th className="px-3 py-2 text-right">≈ garments more</th></tr></thead>
                <tbody>
                    {colourIds.map(cid => {
                        const row = d.cells.filter(x => x.colour_id === cid);
                        const f = fab(cid);
                        return (
                            <tr key={cid} className="border-t border-slate-100">
                                <td className="px-3 py-1.5 font-semibold whitespace-nowrap">{colourName.get(cid)}<span className="block text-[11px] font-normal text-slate-500">ordered {total(row).ordered}</span></td>
                                {sizes.map(s => { const c = cell(cid, s.id); return c ? <Cell key={s.id} t={c} /> : <td key={s.id} className="px-2 py-1.5 text-center text-slate-300">—</td>; })}
                                <Cell t={total(row)} strong />
                                <td className="px-3 py-1.5 text-right tabular-nums">{qtyText(f?.free)}<span className="block text-[11px] text-slate-500">{f?.pieces || 0} piece{f?.pieces === 1 ? '' : 's'}</span></td>
                                <td className={`px-3 py-1.5 text-right tabular-nums ${f && f.garments_possible != null && f.garments_possible < f.short_of_order ? 'text-rose-700 font-bold' : ''}`}>{f?.garments_possible ?? '—'}{f?.short_of_order ? <span className="block text-[11px] font-normal text-slate-500">{f.short_of_order} still short of the order</span> : null}</td>
                            </tr>
                        );
                    })}
                </tbody>
                <tfoot className="border-t-2 border-slate-200 bg-slate-50">
                    <tr><td className="px-3 py-1.5 font-bold">Total<span className="block text-[11px] font-normal text-slate-500">ordered {total(d.cells).ordered}</span></td>
                        {sizes.map(s => <Cell key={s.id} t={total(d.cells.filter(x => x.size_id === s.id))} strong />)}
                        <Cell t={total(d.cells)} strong />
                        <td className="px-3 py-1.5 text-right tabular-nums font-bold">{qtyText(allFree)}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums font-bold">{d.fabric.reduce((s, f) => s + (f.garments_possible || 0), 0)}<span className="block text-[11px] font-normal text-slate-500">{d.fabric.reduce((s, f) => s + f.short_of_order, 0)} short of the order</span></td></tr>
                </tfoot>
            </table>
            <p className="px-4 py-2 text-xs text-slate-500">Fabric per garment: {[...new Set(Object.values(d.length_basis || {}))].join(' · ') || '—'}. "≈ garments more" = free fabric ÷ that length.</p>
        </section>
    );
}

// One lay = one marker: shown, or set (size ratio → length worked out; tick the pieces to lay it on).
function LayCard({ lay, d, can, busy, warnings, sizeName, colourName, onSave, onRemove, onBatch, onCancel }) {
    const fresh = () => ({
        ratio: Object.fromEntries(Object.entries(lay?.ratio || {}).map(([k, v]) => [k, String(v)])),
        rolls: Object.fromEntries((lay?.rolls || []).map(x => [x.key, { garment_colour_id: x.garment_colour_id, planned_plies: String(x.planned_plies) }])),
        notes: lay?.notes || '',
    });
    const [edit, setEdit] = useState(!lay);
    const [f, setF] = useState(fresh);
    const [mode, setMode] = useState('MODE_1');
    const [colourFilter, setColourFilter] = useState('');
    useEffect(() => { if (!edit) setF(fresh()); }, [lay, edit]); // eslint-disable-line react-hooks/exhaustive-deps
    const batched = lay?.batch;
    const title = lay ? `Lay ${lay.lay_no}` : 'New marker';
    if (!edit) {
        const waits = [...new Set(lay.rolls.filter(x => x.key.startsWith('T:')).map(x => x.tail_of_lay_no))].filter(Boolean);
        return (
            <div className={`bg-white border rounded-xl ${batched ? 'border-emerald-200' : warnings.length ? 'border-amber-300' : 'border-slate-200'}`}>
                <div className="px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-slate-100">
                    <h3 className="font-bold text-slate-800">{title}</h3>
                    <span className="text-sm">{d.sizes.filter(s => lay.ratio[s.id]).map(s => <span key={s.id} className="inline-block mr-1.5 px-1.5 py-0.5 rounded bg-slate-100 text-xs font-bold">{s.name}×{lay.ratio[s.id]}</span>)}</span>
                    <span className="text-xs text-slate-600">marker <b>{inText(lay.marker_length_in)}</b> · <b>{lay.plies}</b> plies · <b>{lay.garment_count}</b> garments · {qtyText(lay.fabric)} used · end bits {qtyText(lay.end_bits)}</span>
                    {waits.length > 0 && !batched && <span className="text-[11px] font-bold px-1.5 py-0.5 rounded border border-slate-300 bg-slate-50 text-slate-700">after lay {waits.join(', ')} is cut</span>}
                    <span className="ml-auto flex flex-wrap items-center gap-2">
                        {batched
                            ? <Link to={`/v3/cutting/batches/${batched.id}`} className="text-sm font-semibold text-emerald-700 hover:underline">Batch #{batched.floor_no} {batched.batch_code} <span className={`ml-1 text-[11px] font-black px-1.5 py-0.5 rounded border ${CUT_STATUS[batched.status]?.cls || ''}`}>{CUT_STATUS[batched.status]?.label || batched.status}</span></Link>
                            : can && <>
                                <SecondaryButton disabled={busy} onClick={() => setEdit(true)}><Pencil size={14} /> Edit</SecondaryButton>
                                <SecondaryButton disabled={busy} onClick={onRemove}><Trash2 size={14} /> Remove</SecondaryButton>
                                <select className="px-2 py-2 text-sm border border-slate-300 rounded-lg" value={mode} onChange={e => setMode(e.target.value)} aria-label="Piece numbering"><option value="MODE_1">Numbering per roll</option><option value="MODE_2">Numbering continuous</option></select>
                                <PrimaryButton disabled={busy || !d.cutting_gate.allowed || !lay.rolls.length || !lay.marker_length_in || !lay.ratio_sum || waits.length > 0} onClick={() => onBatch(mode)} title={waits.length ? `It lays a roll end — cut lay ${waits.join(', ')} first` : undefined}><Scissors size={14} /> Create batch</PrimaryButton>
                            </>}
                    </span>
                </div>
                {lay.batch_cancelled && <p className="px-4 pt-2 text-xs text-slate-500">Batch #{lay.batch_cancelled.floor_no} made from this lay was cancelled — the lay is open again.</p>}
                {warnings.length > 0 && <div className="px-4 pt-2 text-sm text-amber-900">{warnings.map(w => <p key={w} className="flex items-start gap-1.5"><AlertTriangle size={14} className="mt-0.5 shrink-0" /> {w.replace(/^Lay \d+: /, '')}</p>)}</div>}
                <GarmentsLine lay={lay} d={d} colourName={colourName} />
                <PiecesTable rows={lay.rolls} colourName={colourName} />
            </div>
        );
    }
    // Set the marker: the pieces to pick from are the plan's free ones (an end an earlier lay leaves included), plus this lay's own.
    const own = (lay?.rolls || []).map(x => ({ ...x, colour_ids: [x.garment_colour_id] }));
    const pool = [...own, ...d.free.filter(p => !own.some(o => o.key === p.key) && !(lay && p.tail_of_lay_no != null && p.tail_of_lay_no >= lay.lay_no))];
    const tickedKeys = Object.keys(f.rolls);
    const colours = [...new Set(tickedKeys.map(k => f.rolls[k].garment_colour_id))];
    const marker = markerOf(f.ratio, colours, d);
    const ratioSum = Object.values(f.ratio).reduce((s, v) => s + (Number(v) || 0), 0);
    const rows = pool.map(p => {
        const t = f.rolls[p.key];
        const max = pliesOf(p, marker);
        const plies = t ? (t.planned_plies === '' ? (max ?? 0) : Number(t.planned_plies) || 0) : (max ?? 0);
        const uses = marker && LEN_PER_IN[p.uom] ? plies * marker * LEN_PER_IN[p.uom] : null;
        return { ...p, ticked: Boolean(t), colour: t?.garment_colour_id || p.colour_ids?.[0], max, plies, uses, end_bit: uses != null ? p.length - uses : null };
    });
    const ticked = rows.filter(r => r.ticked);
    const shown = rows.filter(r => r.ticked || !colourFilter || (r.colour_ids || []).includes(colourFilter));
    const plies = ticked.reduce((s, r) => s + r.plies, 0);
    // Select all: every piece shown (the colour filter applies) that gives at least a ply of this marker; again = clear them.
    const selectable = shown.filter(r => r.max == null || r.max > 0);
    const allOn = selectable.length > 0 && selectable.every(r => r.ticked);
    const selectAll = () => {
        const next = { ...f.rolls };
        for (const r of selectable) {
            if (allOn) delete next[r.key];
            else if (!next[r.key]) next[r.key] = { garment_colour_id: r.colour_ids[0], planned_plies: '' };
        }
        setF({ ...f, rolls: next });
    };
    const tick = (r, on) => {
        const next = { ...f.rolls };
        if (on) next[r.key] = { garment_colour_id: r.colour_ids[0], planned_plies: '' }; else delete next[r.key];
        setF({ ...f, rolls: next });
    };
    const save = () => onSave({
        ratios: Object.entries(f.ratio).filter(([, v]) => Number(v) > 0).map(([size_id, v]) => ({ size_id, ratio: Number(v) })), notes: f.notes,
        rolls: ticked.map(r => ({ key: r.key, label: r.label, garment_colour_id: r.colour, planned_plies: f.rolls[r.key].planned_plies === '' ? null : Number(f.rolls[r.key].planned_plies) })),
    });
    const preview = { ratio: Object.fromEntries(Object.entries(f.ratio).filter(([, v]) => Number(v) > 0).map(([k, v]) => [k, Number(v)])),
        plies_by_colour: ticked.reduce((a, r) => { a[r.colour] = (a[r.colour] || 0) + r.plies; return a; }, {}) };
    return (
        <div className="bg-white border-2 border-indigo-300 rounded-xl p-4">
            <div className="flex flex-wrap items-center gap-2 mb-3">
                <h3 className="font-bold text-slate-800">{title}</h3>
                <span className="text-xs text-slate-500">{ratioSum} garments per marker · marker {inText(marker)} · {ticked.length} picked · {plies} plies · {plies * ratioSum} garments · {qtyText(addQty(ticked, r => r.uses))} used · end bits {qtyText(addQty(ticked, r => r.end_bit))}</span>
                <span className="ml-auto flex gap-2">
                    <PrimaryButton busy={busy} disabled={busy || !ratioSum || !ticked.length || ticked.some(r => r.max === 0 || (r.max != null && r.plies > r.max))} onClick={save}><Save size={14} /> Save lay</PrimaryButton>
                    <SecondaryButton disabled={busy} onClick={() => { if (lay) { setEdit(false); setF(fresh()); } else onCancel(); }}><X size={14} /> Cancel</SecondaryButton>
                </span>
            </div>
            <div className="flex flex-wrap items-end gap-4 mb-3">
                <div>
                    <p className="text-xs font-bold text-slate-600 mb-1">1. Size ratio (garments of each size in the marker)</p>
                    <div className="flex flex-wrap gap-2">{d.sizes.map(s => (
                        <label key={s.id} className="text-center"><span className="block text-xs font-bold text-slate-600">{s.name}</span>
                            <input className={`${inputCls} !w-14 text-center`} type="number" min="0" step="1" value={f.ratio[s.id] || ''} onChange={e => setF({ ...f, ratio: { ...f.ratio, [s.id]: e.target.value } })} aria-label={`Ratio ${s.name}`} /></label>
                    ))}</div>
                </div>
                <div className="text-sm"><p className="text-xs font-bold text-slate-600 mb-1">Marker length (worked out)</p><p className="font-bold text-slate-800 py-2">{inText(marker)}</p></div>
                <label className="flex-1 min-w-[12rem] text-xs font-bold text-slate-600">Notes<input className={`${inputCls} mt-1`} value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} /></label>
            </div>
            <div className="flex flex-wrap items-center gap-2 mb-1.5">
                <p className="text-xs font-bold text-slate-600">2. Tick the rolls / end bits to lay it on</p>
                {selectable.length > 0 && <button type="button" onClick={selectAll} className="text-xs font-bold text-indigo-700 hover:underline">{allOn ? 'Clear' : `Select all ${selectable.length}${colourFilter ? ` ${colourName.get(colourFilter)}` : ''}`}</button>}
                <select className={`${inputCls} !w-auto !py-1 text-xs`} value={colourFilter} onChange={e => setColourFilter(e.target.value)} aria-label="Show the fabric of">
                    <option value="">All colours</option>{d.colours.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
            </div>
            <div className="overflow-x-auto max-h-[46vh] overflow-y-auto border border-slate-200 rounded-lg">
                <table className="w-full text-sm min-w-[820px]">
                    <thead className="bg-slate-50 text-left text-xs font-bold text-slate-500 uppercase tracking-wider sticky top-0"><tr><th className="px-2 py-2 w-8"><input type="checkbox" className="w-4 h-4" checked={allOn} disabled={!selectable.length} onChange={selectAll} aria-label={allOn ? 'Clear the rolls shown' : 'Select all rolls shown'} title={allOn ? 'Clear' : 'Select all shown that give a ply'} /></th><th className="px-2 py-2">Roll</th><th className="px-2 py-2">Colour</th><th className="px-2 py-2">Shade · width</th><th className="px-2 py-2 text-right">Length</th><th className="px-2 py-2 text-right">Plies (gives)</th><th className="px-2 py-2 text-right">Uses</th><th className="px-2 py-2 text-right">End bit</th></tr></thead>
                    <tbody>
                        {shown.length === 0 && <tr><td colSpan={8} className="px-3 py-4 text-center text-slate-400">No fabric free at cutting{colourFilter ? ' for this colour' : ''} — issue it and receive it at cutting.</td></tr>}
                        {shown.map(r => (
                            <tr key={r.key} className={`border-t border-slate-100 ${r.ticked ? 'bg-indigo-50' : r.max === 0 ? 'opacity-50' : ''}`}>
                                <td className="px-2 py-1.5"><input type="checkbox" className="w-4 h-4" checked={r.ticked} disabled={!r.ticked && r.max === 0} onChange={e => tick(r, e.target.checked)} aria-label={`Lay on ${r.label}`} /></td>
                                <td className="px-2 py-1.5 font-semibold whitespace-nowrap">{r.label}{r.roll_end ? <span className="ml-1 text-[11px] font-bold text-slate-600">after lay {r.tail_of_lay_no}</span> : r.lay_piece ? <span className="ml-1 text-[11px] font-bold text-amber-700">end bit</span> : null}</td>
                                <td className="px-2 py-1.5">{r.ticked && (r.colour_ids || []).length > 1
                                    ? <select className={`${inputCls} !py-1`} value={r.colour} onChange={e => setF({ ...f, rolls: { ...f.rolls, [r.key]: { ...f.rolls[r.key], garment_colour_id: e.target.value } } })}>{r.colour_ids.map(c => <option key={c} value={c}>{colourName.get(c)}</option>)}</select>
                                    : (r.colour_ids || []).map(c => colourName.get(c)).join(' / ')}</td>
                                <td className="px-2 py-1.5 text-xs">{r.shade_group || '—'} · {r.width_text || '—'}</td>
                                <td className="px-2 py-1.5 text-right tabular-nums">{fmt(r.length, 2)} {r.uom}</td>
                                <td className="px-2 py-1.5 text-right">{r.ticked
                                    ? <><input className={`${inputCls} !w-16 !py-1 text-right ${r.max != null && r.plies > r.max ? 'border-rose-400' : ''}`} type="number" min="0" step="1" placeholder={String(r.max ?? '')} value={f.rolls[r.key].planned_plies} onChange={e => setF({ ...f, rolls: { ...f.rolls, [r.key]: { ...f.rolls[r.key], planned_plies: e.target.value } } })} aria-label={`Plies on ${r.label}`} /><span className="ml-1 text-xs text-slate-500">({r.max ?? '—'})</span></>
                                    : <span className="tabular-nums text-slate-500">{r.max ?? '—'}</span>}</td>
                                <td className="px-2 py-1.5 text-right tabular-nums">{r.ticked && r.uses != null ? fmt(r.uses, 2) : '—'}</td>
                                <td className={`px-2 py-1.5 text-right tabular-nums ${r.end_bit != null && r.end_bit < 0 ? 'text-rose-700 font-bold' : ''}`}>{r.ticked && r.end_bit != null ? fmt(r.end_bit, 2) : '—'}</td>
                            </tr>
                        ))}
                    </tbody>
                    <tfoot className="border-t-2 border-slate-200 bg-slate-50 text-xs font-bold text-slate-700 sticky bottom-0"><tr><td className="px-2 py-1.5" colSpan={4}>Picked {ticked.length} of {pool.length}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{qtyText(addQty(ticked, r => r.length))}</td><td className="px-2 py-1.5 text-right tabular-nums">{plies}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{qtyText(addQty(ticked, r => r.uses))}</td><td className="px-2 py-1.5 text-right tabular-nums">{qtyText(addQty(ticked, r => r.end_bit))}</td></tr></tfoot>
                </table>
            </div>
            <p className="mt-1 text-xs text-slate-500">Plies: blank = as many as the roll gives (shown in brackets). A roll's end bit can go on a later marker — it is listed "after lay N", and that lay's batch waits until lay N is cut.</p>
            {ticked.length > 0 && <MarkerPreview preview={preview} saved={lay} d={d} colourName={colourName} />}
        </div>
    );
}

// While a marker is being set: per colour on it, the other lays (cut / on batches + planned elsewhere), this lay, and
// together against the target — every size of the colour, so the sizes this marker leaves out show too.
// saved = the lay being changed: its saved garments are taken out of "other lays".
function MarkerPreview({ preview, saved, d, colourName }) {
    const cids = Object.keys(preview.plies_by_colour || {}).filter(c => preview.plies_by_colour[c] > 0);
    if (!cids.length) return null;
    const tone = (v, c) => (!c ? '' : v < c.ordered ? 'bg-rose-50 text-rose-800' : v > c.target ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-800');
    return (
        <div className="mt-3 overflow-x-auto">
            {cids.map(cid => {
                const sizes = d.sizes.filter(s => d.cells.some(x => x.colour_id === cid && x.size_id === s.id) || preview.ratio[s.id]);
                const cell = (sid) => d.cells.find(x => x.colour_id === cid && x.size_id === sid);
                const mine = (sid) => preview.plies_by_colour[cid] * (preview.ratio[sid] || 0);
                const before = (sid) => { const c = cell(sid); return c ? c.covered + c.planned - (saved?.batch ? 0 : saved?.garments?.[cid]?.[sid] || 0) : 0; };
                const sumOf = (f) => sizes.reduce((a, s) => a + f(s.id), 0);
                const total = { ordered: sumOf(sid => cell(sid)?.ordered || 0), target: sumOf(sid => cell(sid)?.target || 0) };
                const anyShort = sizes.some(s => cell(s.id) && before(s.id) + mine(s.id) < cell(s.id).ordered);
                return (
                    <table key={cid} className="text-xs mb-2 border border-slate-200 rounded-lg">
                        <thead className="bg-slate-50 text-slate-500"><tr><th className="px-2 py-1 text-left font-bold">{colourName.get(cid)} · {preview.plies_by_colour[cid]} plies</th>{sizes.map(s => <th key={s.id} className="px-2 py-1 font-bold text-center min-w-[64px]">{s.name}</th>)}<th className="px-2 py-1 font-bold text-center min-w-[72px]">Total</th></tr></thead>
                        <tbody>
                            <tr className="border-t border-slate-100"><td className="px-2 py-1 text-slate-600">Other lays (cut + planned)</td>{sizes.map(s => <td key={s.id} className="px-2 py-1 text-center tabular-nums">{before(s.id) || '—'}</td>)}<td className="px-2 py-1 text-center tabular-nums font-bold">{sumOf(before)}</td></tr>
                            <tr className="border-t border-slate-100"><td className="px-2 py-1 font-semibold text-indigo-700">This lay</td>{sizes.map(s => <td key={s.id} className="px-2 py-1 text-center tabular-nums font-semibold text-indigo-700">{mine(s.id) ? `+${mine(s.id)}` : '—'}</td>)}<td className="px-2 py-1 text-center tabular-nums font-bold text-indigo-700">+{sumOf(mine)}</td></tr>
                        </tbody>
                        <tfoot className="border-t-2 border-slate-200 font-bold"><tr><td className="px-2 py-1">Total / target</td>
                            {sizes.map(s => { const c = cell(s.id); const v = before(s.id) + mine(s.id); return <td key={s.id} className={`px-2 py-1 text-center tabular-nums ${tone(v, c)}`}>{v} / {c?.target ?? 0}{c && v < c.ordered ? <span className="block text-[10px] font-semibold">−{c.ordered - v} to order</span> : c && v > c.target ? <span className="block text-[10px] font-semibold">+{v - c.target} over</span> : null}</td>; })}
                            <td className={`px-2 py-1 text-center tabular-nums ${anyShort ? 'bg-rose-50 text-rose-800' : sumOf(sid => before(sid) + mine(sid)) > total.target ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-800'}`}>{sumOf(sid => before(sid) + mine(sid))} / {total.target}<span className="block text-[10px] font-semibold">order {total.ordered}</span></td></tr></tfoot>
                    </table>
                );
            })}
            <p className="text-[11px] text-slate-500">Red: below the order · green: order covered, up to the target · amber: above the target. A total is red if any size is below the order.</p>
        </div>
    );
}

// Garments a lay gives, per colour × size, with totals.
function GarmentsLine({ lay, d, colourName }) {
    const cids = Object.keys(lay.plies_by_colour || {}).filter(c => lay.plies_by_colour[c] > 0);
    if (!cids.length) return null;
    const sizes = d.sizes.filter(s => lay.ratio[s.id]);
    return (
        <div className="px-4 py-2 overflow-x-auto">
            <table className="text-xs">
                <thead className="text-slate-500"><tr><th className="pr-3 text-left font-bold">Garments</th>{sizes.map(s => <th key={s.id} className="px-2 font-bold">{s.name}</th>)}<th className="px-2 font-bold">Total</th></tr></thead>
                <tbody>{cids.map(c => (
                    <tr key={c}><td className="pr-3 font-semibold">{colourName.get(c)} · {lay.plies_by_colour[c]} plies</td>{sizes.map(s => <td key={s.id} className="px-2 text-center tabular-nums">{lay.plies_by_colour[c] * lay.ratio[s.id]}</td>)}
                        <td className="px-2 text-center tabular-nums font-bold">{sizes.reduce((a, s) => a + lay.plies_by_colour[c] * lay.ratio[s.id], 0)}</td></tr>
                ))}</tbody>
                <tfoot className="border-t border-slate-200 font-bold"><tr><td className="pr-3">Total</td>{sizes.map(s => <td key={s.id} className="px-2 text-center tabular-nums">{cids.reduce((a, c) => a + lay.plies_by_colour[c] * lay.ratio[s.id], 0)}</td>)}
                    <td className="px-2 text-center tabular-nums">{cids.reduce((a, c) => a + sizes.reduce((b, s) => b + lay.plies_by_colour[c] * lay.ratio[s.id], 0), 0)}</td></tr></tfoot>
            </table>
        </div>
    );
}

function PiecesTable({ rows, colourName }) {
    if (!rows.length) return <p className="px-4 py-3 text-sm text-slate-400">No rolls on this lay.</p>;
    return (
        <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
                <thead className="text-left text-xs font-bold text-slate-500 uppercase tracking-wider"><tr><th className="px-4 py-1.5">Roll</th><th className="px-2 py-1.5">Colour</th><th className="px-2 py-1.5">Shade · width</th><th className="px-2 py-1.5 text-right">Length</th><th className="px-2 py-1.5 text-right">Plies</th><th className="px-2 py-1.5 text-right">Uses</th><th className="px-4 py-1.5 text-right">End bit</th></tr></thead>
                <tbody>{rows.map(x => (
                    <tr key={x.key} className="border-t border-slate-100">
                        <td className="px-4 py-1.5 font-semibold">{x.label}{x.roll_end ? <span className="ml-1 text-[11px] font-bold text-slate-600">after lay {x.tail_of_lay_no}</span> : x.lay_piece ? <span className="ml-1 text-[11px] font-bold text-amber-700">end bit</span> : null}</td>
                        <td className="px-2 py-1.5">{colourName.get(x.garment_colour_id)}</td>
                        <td className="px-2 py-1.5 text-xs">{x.shade_group || '—'} · {x.width_text || '—'}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{x.length != null ? `${fmt(x.length, 2)} ${x.uom}` : '—'}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums font-bold">{x.planned_plies}{x.max_plies != null && x.max_plies !== x.planned_plies ? <span className="font-normal text-slate-400"> / {x.max_plies}</span> : ''}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{x.uses != null ? fmt(x.uses, 2) : '—'}</td>
                        <td className="px-4 py-1.5 text-right tabular-nums">{x.end_bit != null ? fmt(x.end_bit, 2) : '—'}</td>
                    </tr>
                ))}</tbody>
                <tfoot className="border-t-2 border-slate-200 bg-slate-50 text-xs font-bold text-slate-700"><tr><td className="px-4 py-1.5" colSpan={3}>Total {rows.length} roll{rows.length === 1 ? '' : 's'}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{qtyText(addQty(rows, x => x.length))}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{rows.reduce((s, x) => s + (Number(x.planned_plies) || 0), 0)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{qtyText(addQty(rows, x => x.uses))}</td>
                    <td className="px-4 py-1.5 text-right tabular-nums">{qtyText(addQty(rows, x => x.end_bit))}</td></tr></tfoot>
            </table>
        </div>
    );
}

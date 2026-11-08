// Cut order plan for an order line (8 Nov 2026, owner: "we must build intelligent module which calculate and suggest cut
// plan. it has to be dynamic user can change or control rules of cut plan"). Backend: controllers/v3/cutPlansController.js,
// engine controllers/v3/cutPlanner.js.
//   Rules: the plan's cut allowance (its own %) and lay rules (end loss per ply, lay height, garments per marker, marker
//          length, extra pieces per size, colour / shade / width mixing), defaulting to the factory's; managers can save
//          them as the factory's defaults, the factory admin decides whether batches must come from a plan.
//   Target: per colour × size, the order + the plan's allowance against what is cut / on batches and planned on lays.
//   Fabric: what is free at cutting per colour against what is still to plan.
//   Lays: suggested or typed — ratio, marker length (estimated from this style's past batches or the BOM), whole rolls
//          of one shade / width group with planned plies, the end bit each leaves; every change is checked against the
//          rules (warnings only). "Create batch" turns a lay into a cut batch.
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Wand2, Plus, Save, Scissors, Trash2, Pencil, X, AlertTriangle, Layers, ChevronDown, ChevronRight } from 'lucide-react';
import { cuttingApi } from '../api/cuttingApi';
import { apiError } from '../api/mastersApi';
import { PageHeader, Field, inputCls, PrimaryButton, SecondaryButton, ErrorBox, Loading } from '../components/ui';
import { fmtDate } from '../salesOrders/SalesOrderStatusBadge';
import { CUT_STATUS, LEN_PER_IN, fmt } from './cutShared';

const RULES = [
    ['end_loss_cm', 'End loss per ply (cm)', 'Both ends of a ply together.'],
    ['max_plies', 'Max plies per lay', 'Lay height the knife cuts cleanly.'],
    ['min_plies', 'Small lay below (plies)', 'Smaller lays only for what the order itself still needs.'],
    ['max_garments', 'Max garments per marker', 'Ratio total.'],
    ['min_garments', 'Min garments per marker', 'Fuller markers nest better; a small rest may go below.'],
    ['max_marker_in', 'Max marker length (in)', 'Table length less margins.'],
    ['over_pcs', 'Extra pieces per size', 'Above the target, to save a lay.'],
    ['width_tol_cm', 'Width group within (cm)', 'Rolls this close in width are one group.'],
    ['max_lays', 'Max lays', 'Each lay is a batch. 0 = no limit.'],
    ['max_markers', 'Max markers', 'Different ratios; one marker can be laid again. 0 = no limit.'],
];
const SWITCHES = [
    ['mix_colours', 'Stack colours with the same ratio in one lay'],
    ['mix_shade', 'Allow different shade groups in one lay'],
    ['mix_width', 'Allow different width groups in one lay'],
];
const CM_PER_IN = 2.54;
const plyIn = (marker, rules) => (Number(marker) > 0 ? Number(marker) + rules.end_loss_cm / CM_PER_IN : null);
const maxPlies = (roll, marker, rules) => {
    const p = plyIn(marker, rules);
    return p && LEN_PER_IN[roll.uom] ? Math.floor(roll.length / (p * LEN_PER_IN[roll.uom]) + 1e-9) : null;
};
const qtyText = (o) => Object.entries(o || {}).filter(([, v]) => v).map(([u, v]) => `${fmt(v, 2)} ${u}`).join(' + ') || '—';
const widthText = (r) => (r.measured_width ? `${r.measured_width} ${r.measured_width_unit}` : r.store_width ? `${r.store_width} ${r.store_width_unit || ''}`.trim() : '—');

export default function CutPlanPage() {
    const { lineId } = useParams();
    const navigate = useNavigate();
    const [d, setD] = useState(null);
    const [error, setError] = useState('');
    const [msg, setMsg] = useState('');
    const [busy, setBusy] = useState(false);
    const [rules, setRules] = useState(null);
    const [allowance, setAllowance] = useState('');
    const [adding, setAdding] = useState(false);
    const [showHistory, setShowHistory] = useState(false);
    const [mandatory, setMandatory] = useState(false);
    const take = (data) => { setD(data); setRules(data.rules); setAllowance(String(data.allowance_pct)); setMandatory(Boolean(data.defaults?.plan_mandatory)); };
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
    const rulesChanged = rules && (JSON.stringify(rules) !== JSON.stringify(d.rules) || Number(allowance) !== d.allowance_pct);
    const openLays = d.lays.filter(l => !l.batch);
    const layWarnings = (no) => d.warnings.filter(w => w.startsWith(`Lay ${no}:`));
    const general = d.warnings.filter(w => !/^Lay \d+:/.test(w));
    const saveRules = (then) => run(() => cuttingApi.savePlan(lineId, { allowance_pct: Number(allowance), rules }), then);
    const suggest = () => {
        if (openLays.length && !window.confirm(`Suggest again? The ${openLays.length} lay(s) not yet batches are replaced; lays already batches stay.`)) return;
        run(async () => {
            if (rulesChanged) await cuttingApi.savePlan(lineId, { allowance_pct: Number(allowance), rules });
            return cuttingApi.suggestPlan(lineId);
        }, (data) => setMsg(data?.suggestion_warnings?.length ? '' : 'Plan suggested — check each lay, change what the floor knows better, then create the batches.'));
    };
    // Coverage matrix: covered + planned against the target.
    const cell = (cid, sid) => d.cells.find(x => x.colour_id === cid && x.size_id === sid);
    const colourIds = [...new Set(d.cells.map(x => x.colour_id))];
    const sizeIds = d.sizes.filter(s => d.cells.some(x => x.size_id === s.id)).map(s => s.id);
    const total = (list) => list.reduce((a, x) => ({ target: a.target + x.target, covered: a.covered + x.covered, planned: a.planned + x.planned, ordered: a.ordered + x.ordered }), { target: 0, covered: 0, planned: 0, ordered: 0 });
    const tone = (t) => (!t.target && !t.covered && !t.planned ? '' : t.covered + t.planned < t.ordered ? 'bg-rose-50 text-rose-800' : t.covered + t.planned - t.target > (d.rules.over_pcs || 0) ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-800');
    const Cell = ({ t, strong }) => (
        <td className={`px-2 py-1.5 text-center tabular-nums ${tone(t)} ${strong ? 'font-bold' : ''}`}>
            <span className="font-bold">{t.covered + t.planned}</span><span className="text-slate-500"> / {t.target}</span>
            {t.planned > 0 && <span className="block text-[11px] text-indigo-700">+{t.planned} planned</span>}
        </td>
    );
    return (
        <div>
            <Link to="/v3/cutting" className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-indigo-600 mb-3"><ArrowLeft size={15} /> Cutting</Link>
            <PageHeader title={`Cut plan — ${d.line.order_no} line ${d.line.line_no}`} subtitle={`${d.line.customer_name} · ${d.line.style_code} ${d.line.style_name} · ships ${fmtDate(d.line.ship_date)}`}
                actions={<div className="flex flex-wrap gap-2">
                    <Link to={`/v3/cutting/orders/${d.line.order_id}/roll-groups`} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold border border-slate-300 rounded-lg hover:border-indigo-400"><Layers size={15} /> Group rolls</Link>
                    {can && !d.defaults.plan_mandatory && <Link to={`/v3/cutting/lines/${lineId}/new`} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold border border-slate-300 rounded-lg hover:border-indigo-400">Batch without plan</Link>}
                </div>} />
            <div className={`mb-3 text-sm rounded-lg px-3 py-2 border ${d.cutting_gate.allowed ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-rose-50 border-rose-200 text-rose-900'}`}><b>Cutting gate:</b> {d.cutting_gate.allowed ? (d.cutting_gate.ready ? 'open — all materials covered.' : `open by override — ${d.cutting_gate.reason}`) : `closed — ${d.cutting_gate.reason}`}</div>
            {d.notes.map(n => <p key={n} className="mb-3 text-sm rounded-lg bg-amber-50 border border-amber-200 text-amber-900 px-3 py-2">{n}</p>)}
            <ErrorBox text={error} />
            {msg && <p className="mb-3 text-sm rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 px-3 py-2">{msg}</p>}

            {/* Rules */}
            <section className="bg-white border border-slate-200 rounded-xl p-4 mb-4">
                <div className="flex flex-wrap items-baseline gap-2 mb-3">
                    <h2 className="font-bold text-slate-800">Rules for this plan</h2>
                    <span className="text-xs text-slate-500">{d.exists ? 'Changed rules apply to the next suggestion and to the checks below.' : 'Factory defaults — change any for this order line.'}</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <Field label="Cut allowance %" hint={`Order: ${d.order_allowance_pct}%. This plan's own target.`}>
                        <input className={inputCls} type="number" min="0" max="50" step="0.5" value={allowance} disabled={!can} onChange={e => setAllowance(e.target.value)} />
                    </Field>
                    {RULES.map(([k, label, hint]) => (
                        <Field key={k} label={label} hint={hint}>
                            <input className={`${inputCls} ${rules[k] !== d.defaults.rules[k] ? 'border-indigo-400 bg-indigo-50/40' : ''}`} type="number" min="0" step="any" value={rules[k]} disabled={!can}
                                onChange={e => setRules({ ...rules, [k]: e.target.value === '' ? '' : Number(e.target.value) })} />
                        </Field>
                    ))}
                </div>
                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
                    {SWITCHES.map(([k, label]) => (
                        <label key={k} className={`flex items-center gap-2 text-sm ${rules[k] !== d.defaults.rules[k] ? 'font-semibold text-indigo-800' : 'text-slate-700'}`}>
                            <input type="checkbox" checked={Boolean(rules[k])} disabled={!can} onChange={e => setRules({ ...rules, [k]: e.target.checked })} /> {label}
                        </label>
                    ))}
                </div>
                {can && (
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                        <PrimaryButton onClick={() => saveRules(() => setMsg('Rules saved.'))} busy={busy} disabled={busy || !rulesChanged}><Save size={15} /> Save rules</PrimaryButton>
                        <SecondaryButton disabled={busy} onClick={() => setRules({ ...d.defaults.rules })}>Use factory defaults</SecondaryButton>
                        <SecondaryButton disabled={busy} onClick={() => { if (window.confirm('Make these rules the factory defaults for every new cut plan?')) run(() => cuttingApi.savePlanSettings({ rules }), () => cuttingApi.plan(lineId).then(res => { take(res.data); setMsg('Factory defaults saved.'); })); }}>Save as factory defaults</SecondaryButton>
                        {d.can.settings && (
                            <label className="ml-auto flex items-center gap-2 text-sm text-slate-700">
                                <input type="checkbox" checked={mandatory} disabled={busy} onChange={e => { const v = e.target.checked; if (window.confirm(v ? 'From now on batches can only be created from a cut plan lay. Continue?' : 'Allow batches without a cut plan again?')) run(() => cuttingApi.savePlanSettings({ plan_mandatory: v }), () => { setMandatory(v); cuttingApi.plan(lineId).then(res => take(res.data)); }); }} />
                                Batches only from a cut plan (factory)
                            </label>
                        )}
                    </div>
                )}
            </section>

            {/* Target */}
            <section className="bg-white border border-slate-200 rounded-xl mb-4 overflow-x-auto">
                <div className="px-4 pt-3 pb-2 flex flex-wrap items-baseline gap-2">
                    <h2 className="font-bold text-slate-800">Target</h2>
                    <span className="text-xs text-slate-500">Cut or on batches + planned / order + {d.allowance_pct}%. Green covered · amber above the target · red below the order.</span>
                </div>
                <table className="w-full text-sm min-w-[640px]">
                    <thead className="bg-slate-50 text-xs font-bold text-slate-500 uppercase tracking-wider"><tr><th className="px-3 py-2 text-left">Colour</th>{sizeIds.map(sid => <th key={sid} className="px-2 py-2 text-center">{sizeName.get(sid)}</th>)}<th className="px-2 py-2 text-center">Total</th></tr></thead>
                    <tbody>
                        {colourIds.map(cid => {
                            const row = d.cells.filter(x => x.colour_id === cid);
                            return (
                                <tr key={cid} className="border-t border-slate-100">
                                    <td className="px-3 py-1.5 font-semibold whitespace-nowrap">{colourName.get(cid)}<span className="block text-[11px] font-normal text-slate-500">ordered {total(row).ordered}</span></td>
                                    {sizeIds.map(sid => { const c = cell(cid, sid); return c ? <Cell key={sid} t={c} /> : <td key={sid} className="px-2 py-1.5 text-center text-slate-300">—</td>; })}
                                    <Cell t={total(row)} strong />
                                </tr>
                            );
                        })}
                    </tbody>
                    <tfoot className="border-t-2 border-slate-200 bg-slate-50">
                        <tr><td className="px-3 py-1.5 font-bold">Total<span className="block text-[11px] font-normal text-slate-500">ordered {total(d.cells).ordered}</span></td>
                            {sizeIds.map(sid => <Cell key={sid} t={total(d.cells.filter(x => x.size_id === sid))} strong />)}
                            <Cell t={total(d.cells)} strong /></tr>
                    </tfoot>
                </table>
            </section>

            {/* Fabric */}
            <section className="bg-white border border-slate-200 rounded-xl mb-4 overflow-x-auto">
                <div className="px-4 pt-3 pb-2 flex flex-wrap items-baseline gap-2">
                    <h2 className="font-bold text-slate-800">Fabric at cutting</h2>
                    <span className="text-xs text-slate-500">Received for this order, not on a batch. Marker length per garment: {Object.entries(d.marker_basis).map(([cid, t]) => <span key={cid} className="mr-2"><b>{colourName.get(cid)}</b> {t}</span>).slice(0, 1)}</span>
                </div>
                <table className="w-full text-sm min-w-[720px]">
                    <thead className="bg-slate-50 text-left text-xs font-bold text-slate-500 uppercase tracking-wider"><tr><th className="px-3 py-2">Colour</th><th className="px-3 py-2 text-right">Rolls</th><th className="px-3 py-2 text-right">End bits</th><th className="px-3 py-2 text-right">On lays</th><th className="px-3 py-2 text-right">Not on a lay</th><th className="px-3 py-2 text-right">Garments still to plan</th><th className="px-3 py-2 text-right">Fabric they need</th></tr></thead>
                    <tbody>
                        {d.fabric.length === 0 && <tr><td colSpan={7} className="px-4 py-6 text-center text-slate-400">No fabric received at cutting for this order line. Issue it first (Issue fabric), and receive it at cutting.</td></tr>}
                        {d.fabric.map(f => (
                            <tr key={f.colour_id} className="border-t border-slate-100">
                                <td className="px-3 py-2 font-semibold">{colourName.get(f.colour_id)}</td>
                                <td className="px-3 py-2 text-right tabular-nums">{f.rolls}</td>
                                <td className="px-3 py-2 text-right tabular-nums">{f.pieces}</td>
                                <td className="px-3 py-2 text-right tabular-nums">{qtyText(f.on_lays)}</td>
                                <td className="px-3 py-2 text-right tabular-nums">{qtyText(f.free)}</td>
                                <td className="px-3 py-2 text-right tabular-nums">{f.still_to_plan}</td>
                                <td className={`px-3 py-2 text-right tabular-nums ${f.short ? 'text-rose-700 font-bold' : ''}`}>{f.needed ? `${fmt(f.needed.qty, 2)} ${f.needed.uom}${f.short ? ' — short' : ''}` : '—'}</td>
                            </tr>
                        ))}
                    </tbody>
                    {d.fabric.length > 0 && (
                        <tfoot className="border-t-2 border-slate-200 bg-slate-50 text-xs font-bold text-slate-700">
                            <tr><td className="px-3 py-2">Total</td>
                                <td className="px-3 py-2 text-right tabular-nums">{d.fabric.reduce((s, f) => s + f.rolls, 0)}</td>
                                <td className="px-3 py-2 text-right tabular-nums">{d.fabric.reduce((s, f) => s + f.pieces, 0)}</td>
                                <td className="px-3 py-2 text-right tabular-nums">{qtyText(d.fabric.reduce((a, f) => { for (const [u, v] of Object.entries(f.on_lays)) a[u] = (a[u] || 0) + v; return a; }, {}))}</td>
                                <td className="px-3 py-2 text-right tabular-nums">{qtyText(d.fabric.reduce((a, f) => { for (const [u, v] of Object.entries(f.free)) a[u] = (a[u] || 0) + v; return a; }, {}))}</td>
                                <td className="px-3 py-2 text-right tabular-nums">{d.fabric.reduce((s, f) => s + f.still_to_plan, 0)}</td>
                                <td className="px-3 py-2 text-right tabular-nums">{qtyText(d.fabric.reduce((a, f) => { if (f.needed) a[f.needed.uom] = (a[f.needed.uom] || 0) + f.needed.qty; return a; }, {}))}</td></tr>
                        </tfoot>
                    )}
                </table>
            </section>

            {/* Lays */}
            <div className="flex flex-wrap items-center gap-2 mb-3">
                <h2 className="font-bold text-slate-800 mr-2">Lays</h2>
                {can && <PrimaryButton onClick={suggest} busy={busy} disabled={busy}><Wand2 size={15} /> {openLays.length ? 'Suggest again' : 'Suggest plan'}</PrimaryButton>}
                {can && !adding && <SecondaryButton disabled={busy} onClick={() => setAdding(true)}><Plus size={15} /> Add lay</SecondaryButton>}
                <span className="ml-auto text-xs text-slate-500">{d.lays.length} lay{d.lays.length === 1 ? '' : 's'}{d.rules.max_lays ? ` of ${d.rules.max_lays}` : ''} · {new Set(d.lays.filter(l => l.ratio_sum).map(l => `${JSON.stringify(l.ratio)}|${l.marker_length_in}`)).size} marker(s){d.rules.max_markers ? ` of ${d.rules.max_markers}` : ''} · {d.lays.reduce((s, l) => s + l.plies, 0)} plies · {d.lays.reduce((s, l) => s + l.garment_count, 0)} garments</span>
            </div>
            {(general.length > 0 || (d.suggestion_warnings || []).length > 0) && (
                <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    {[...(d.suggestion_warnings || []), ...general].map(w => <p key={w} className="flex items-start gap-1.5"><AlertTriangle size={14} className="mt-0.5 shrink-0" /> {w}</p>)}
                </div>
            )}
            {d.lays.length === 0 && !adding && <p className="mb-4 text-sm text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-6 text-center">No lays yet. {can ? 'Suggest a plan from the order and the fabric at cutting, or add a lay yourself.' : ''}</p>}
            <div className="space-y-3 mb-4">
                {d.lays.map(l => <LayCard key={l.id} lay={l} d={d} rules={d.rules} can={can} busy={busy} warnings={layWarnings(l.lay_no)} sizeName={sizeName} colourName={colourName}
                    onSave={(body) => run(() => cuttingApi.updatePlanLay(l.id, body))}
                    onRemove={() => { if (window.confirm(`Remove lay ${l.lay_no}?`)) run(() => cuttingApi.removePlanLay(l.id)); }}
                    onBatch={(mode) => run(() => cuttingApi.batchFromLay(l.id, { numbering_mode: mode }), (b) => navigate(`/v3/cutting/batches/${b.id}`))} />)}
                {adding && <LayCard lay={null} d={d} rules={d.rules} can={can} busy={busy} warnings={[]} sizeName={sizeName} colourName={colourName}
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

// One lay: shown, or edited (ratio, marker length, rolls with planned plies). lay = null → a new lay.
function LayCard({ lay, d, rules, can, busy, warnings, sizeName, colourName, onSave, onRemove, onBatch, onCancel }) {
    const fresh = () => ({
        ratio: Object.fromEntries(Object.entries(lay?.ratio || {}).map(([k, v]) => [k, String(v)])),
        marker: lay?.marker_length_in ? String(lay.marker_length_in) : '',
        rolls: (lay?.rolls || []).map(x => ({ key: x.key, garment_colour_id: x.garment_colour_id, planned_plies: String(x.planned_plies) })),
        notes: lay?.notes || '',
    });
    const [edit, setEdit] = useState(!lay);
    const [f, setF] = useState(fresh);
    const [mode, setMode] = useState('MODE_1');
    const [pick, setPick] = useState('');
    useEffect(() => { if (!edit) setF(fresh()); }, [lay, edit]); // eslint-disable-line react-hooks/exhaustive-deps
    const rollOf = (key) => d.rolls.find(r => r.key === key);
    const ratioSum = Object.values(f.ratio).reduce((s, v) => s + (Number(v) || 0), 0);
    const estimate = () => {
        const per = d.length_per_size[f.rolls[0]?.garment_colour_id] || Object.values(d.length_per_size)[0] || {};
        const v = Object.entries(f.ratio).reduce((s, [sid, n]) => s + (Number(n) || 0) * (per[sid] || 0), 0);
        return v ? Math.round(v * 100) / 100 : null;
    };
    const free = d.rolls.filter(r => (!r.on_lay || r.on_lay === lay?.lay_no) && !f.rolls.some(x => x.key === r.key));
    const save = () => onSave({
        ratios: Object.entries(f.ratio).filter(([, v]) => Number(v) > 0).map(([size_id, v]) => ({ size_id, ratio: Number(v) })),
        marker_length_in: f.marker === '' ? null : Number(f.marker), notes: f.notes,
        rolls: f.rolls.map(x => ({ key: x.key, garment_colour_id: x.garment_colour_id, planned_plies: Number(x.planned_plies) || 0 })),
    });
    const batched = lay?.batch;
    const title = lay ? `Lay ${lay.lay_no}` : 'New lay';
    if (!edit) {
        return (
            <div className={`bg-white border rounded-xl ${batched ? 'border-emerald-200' : warnings.length ? 'border-amber-300' : 'border-slate-200'}`}>
                <div className="px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-slate-100">
                    <h3 className="font-bold text-slate-800">{title}</h3>
                    <span className="text-sm">{d.sizes.filter(s => lay.ratio[s.id]).map(s => <span key={s.id} className="inline-block mr-1.5 px-1.5 py-0.5 rounded bg-slate-100 text-xs font-bold">{s.name}×{lay.ratio[s.id]}</span>)}</span>
                    <span className="text-xs text-slate-600">marker <b>{lay.marker_length_in ?? '—'} in</b>{lay.ply_length_in ? ` · ply ${lay.ply_length_in} in` : ''} · <b>{lay.plies}</b> plies · <b>{lay.garment_count}</b> garments{lay.fabric.length ? ` · ${lay.fabric.map(x => `${fmt(x.qty, 2)} ${x.uom}`).join(' + ')}` : ''}{lay.narrowest_width_in ? ` · marker width ≤ ${lay.narrowest_width_in} in` : ''}</span>
                    {lay.source === 'SUGGESTED' && !batched && <span className="text-[11px] font-bold px-1.5 py-0.5 rounded border border-indigo-200 bg-indigo-50 text-indigo-700">suggested</span>}
                    <span className="ml-auto flex flex-wrap items-center gap-2">
                        {batched
                            ? <Link to={`/v3/cutting/batches/${batched.id}`} className="text-sm font-semibold text-emerald-700 hover:underline">Batch #{batched.floor_no} {batched.batch_code} <span className={`ml-1 text-[11px] font-black px-1.5 py-0.5 rounded border ${CUT_STATUS[batched.status]?.cls || ''}`}>{CUT_STATUS[batched.status]?.label || batched.status}</span></Link>
                            : can && <>
                                <SecondaryButton disabled={busy} onClick={() => setEdit(true)}><Pencil size={14} /> Edit</SecondaryButton>
                                <SecondaryButton disabled={busy} onClick={onRemove}><Trash2 size={14} /> Remove</SecondaryButton>
                                <select className="px-2 py-2 text-sm border border-slate-300 rounded-lg" value={mode} onChange={e => setMode(e.target.value)} aria-label="Piece numbering"><option value="MODE_1">Numbering per roll</option><option value="MODE_2">Numbering continuous</option></select>
                                <PrimaryButton disabled={busy || !d.cutting_gate.allowed || !lay.rolls.length || !lay.marker_length_in || !lay.ratio_sum} onClick={() => onBatch(mode)}><Scissors size={14} /> Create batch</PrimaryButton>
                            </>}
                    </span>
                </div>
                {lay.batch_cancelled && <p className="px-4 pt-2 text-xs text-slate-500">Batch #{lay.batch_cancelled.floor_no} made from this lay was cancelled — the lay is open again.</p>}
                {warnings.length > 0 && <div className="px-4 pt-2 text-sm text-amber-900">{warnings.map(w => <p key={w} className="flex items-start gap-1.5"><AlertTriangle size={14} className="mt-0.5 shrink-0" /> {w.replace(/^Lay \d+: /, '')}</p>)}</div>}
                <LayRolls lay={lay} rows={lay.rolls.map(x => ({ ...x, roll: rollOf(x.key) }))} colourName={colourName} />
            </div>
        );
    }
    // Edit mode: figures computed here as you type; the server checks again on save.
    const rows = f.rolls.map(x => {
        const r = rollOf(x.key);
        const max = r ? maxPlies(r, f.marker, rules) : null;
        const p = plyIn(f.marker, rules);
        const uses = r && p && LEN_PER_IN[r.uom] ? (Number(x.planned_plies) || 0) * p * LEN_PER_IN[r.uom] : null;
        return { ...x, roll: r, max, uses, end_bit: uses != null ? r.length - uses : null };
    });
    const plies = rows.reduce((s, x) => s + (Number(x.planned_plies) || 0), 0);
    const est = estimate();
    return (
        <div className="bg-white border-2 border-indigo-300 rounded-xl p-4">
            <div className="flex flex-wrap items-center gap-2 mb-3">
                <h3 className="font-bold text-slate-800">{title}</h3>
                <span className="text-xs text-slate-500">{ratioSum} garments per marker · {plies} plies · {plies * ratioSum} garments</span>
                <span className="ml-auto flex gap-2">
                    <PrimaryButton busy={busy} disabled={busy} onClick={save}><Save size={14} /> Save lay</PrimaryButton>
                    <SecondaryButton disabled={busy} onClick={() => { if (lay) { setEdit(false); setF(fresh()); } else onCancel(); }}><X size={14} /> Cancel</SecondaryButton>
                </span>
            </div>
            <div className="flex flex-wrap items-end gap-4 mb-3">
                <div>
                    <p className="text-xs font-bold text-slate-600 mb-1">Size ratio</p>
                    <div className="flex flex-wrap gap-2">{d.sizes.map(s => (
                        <label key={s.id} className="text-center"><span className="block text-xs font-bold text-slate-600">{s.name}</span>
                            <input className={`${inputCls} !w-14 text-center`} type="number" min="0" step="1" value={f.ratio[s.id] || ''} onChange={e => setF({ ...f, ratio: { ...f.ratio, [s.id]: e.target.value } })} aria-label={`Ratio ${s.name}`} /></label>
                    ))}</div>
                </div>
                <Field label="Marker length (in)" hint={est ? `Estimate ${est} in` : ' '}>
                    <div className="flex gap-1"><input className={`${inputCls} !w-28`} type="number" min="1" step="0.01" value={f.marker} onChange={e => setF({ ...f, marker: e.target.value })} />
                        {est && <button type="button" className="px-2 text-xs font-semibold text-indigo-700 border border-indigo-200 rounded-lg hover:bg-indigo-50" onClick={() => setF({ ...f, marker: String(est) })}>Use</button>}</div>
                </Field>
                <div className="flex-1 min-w-[12rem]"><Field label="Notes"><input className={inputCls} value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} /></Field></div>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[760px]">
                    <thead className="bg-slate-50 text-left text-xs font-bold text-slate-500 uppercase tracking-wider"><tr><th className="px-2 py-2">Roll</th><th className="px-2 py-2">Colour</th><th className="px-2 py-2">Shade · width</th><th className="px-2 py-2 text-right">Length</th><th className="px-2 py-2 text-right">Plies (max)</th><th className="px-2 py-2 text-right">Uses</th><th className="px-2 py-2 text-right">End bit</th><th /></tr></thead>
                    <tbody>
                        {rows.length === 0 && <tr><td colSpan={8} className="px-3 py-4 text-center text-slate-400">No rolls on this lay yet — add them below.</td></tr>}
                        {rows.map((x, i) => (
                            <tr key={x.key} className="border-t border-slate-100">
                                <td className="px-2 py-1.5 font-semibold">{x.roll?.label || x.key}{x.roll?.lay_piece && <span className="ml-1 text-[11px] font-bold text-amber-700">end bit</span>}</td>
                                <td className="px-2 py-1.5">{x.roll && x.roll.colour_ids.length > 1
                                    ? <select className={`${inputCls} !py-1`} value={x.garment_colour_id} onChange={e => setF({ ...f, rolls: f.rolls.map((y, j) => (j === i ? { ...y, garment_colour_id: e.target.value } : y)) })}>{x.roll.colour_ids.map(c => <option key={c} value={c}>{colourName.get(c)}</option>)}</select>
                                    : colourName.get(x.garment_colour_id)}</td>
                                <td className="px-2 py-1.5 text-xs">{x.roll?.shade_group || '—'} · {x.roll ? widthText(x.roll) : '—'}</td>
                                <td className="px-2 py-1.5 text-right tabular-nums">{x.roll ? `${fmt(x.roll.length, 2)} ${x.roll.uom}` : '—'}</td>
                                <td className="px-2 py-1.5 text-right"><input className={`${inputCls} !w-20 !py-1 text-right ${x.max != null && Number(x.planned_plies) > x.max ? 'border-rose-400' : ''}`} type="number" min="0" step="1" value={x.planned_plies} onChange={e => setF({ ...f, rolls: f.rolls.map((y, j) => (j === i ? { ...y, planned_plies: e.target.value } : y)) })} aria-label={`Plies on ${x.roll?.label}`} />
                                    <span className="ml-1 text-xs text-slate-500">({x.max ?? '—'})</span></td>
                                <td className="px-2 py-1.5 text-right tabular-nums">{x.uses != null ? fmt(x.uses, 2) : '—'}</td>
                                <td className={`px-2 py-1.5 text-right tabular-nums ${x.end_bit != null && x.end_bit < 0 ? 'text-rose-700 font-bold' : ''}`}>{x.end_bit != null ? fmt(x.end_bit, 2) : '—'}</td>
                                <td className="px-2 py-1.5 text-right"><button type="button" className="p-1 text-rose-600 hover:bg-rose-50 rounded" onClick={() => setF({ ...f, rolls: f.rolls.filter((_, j) => j !== i) })} aria-label="Take off the lay"><X size={14} /></button></td>
                            </tr>
                        ))}
                    </tbody>
                    <tfoot className="border-t-2 border-slate-200 bg-slate-50 text-xs font-bold text-slate-700"><tr><td className="px-2 py-1.5" colSpan={3}>Total {rows.length} roll{rows.length === 1 ? '' : 's'}</td><td className="px-2 py-1.5 text-right tabular-nums">{qtyText(rows.reduce((a, x) => { if (x.roll) a[x.roll.uom] = (a[x.roll.uom] || 0) + x.roll.length; return a; }, {}))}</td><td className="px-2 py-1.5 text-right tabular-nums">{plies}</td><td className="px-2 py-1.5 text-right tabular-nums">{qtyText(rows.reduce((a, x) => { if (x.uses != null) a[x.roll.uom] = (a[x.roll.uom] || 0) + x.uses; return a; }, {}))}</td><td className="px-2 py-1.5 text-right tabular-nums">{qtyText(rows.reduce((a, x) => { if (x.end_bit != null) a[x.roll.uom] = (a[x.roll.uom] || 0) + x.end_bit; return a; }, {}))}</td><td /></tr></tfoot>
                </table>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
                <select className={`${inputCls} !w-auto max-w-md`} value={pick} onChange={e => setPick(e.target.value)} aria-label="Add a roll">
                    <option value="">Add a roll free at cutting… ({free.length})</option>
                    {free.map(r => <option key={r.key} value={r.key}>{r.label} · {fmt(r.length, 2)} {r.uom} · {r.colour_ids.map(c => colourName.get(c)).join('/')}{r.shade_group ? ` · ${r.shade_group}` : ''}{r.width_group ? ` ${r.width_group}` : ''}{maxPlies(r, f.marker, rules) != null ? ` · ${maxPlies(r, f.marker, rules)} plies` : ''}</option>)}
                </select>
                <SecondaryButton disabled={!pick} onClick={() => { const r = rollOf(pick); setF({ ...f, rolls: [...f.rolls, { key: r.key, garment_colour_id: r.colour_ids[0], planned_plies: String(maxPlies(r, f.marker, rules) ?? 0) }] }); setPick(''); }}><Plus size={14} /> Add</SecondaryButton>
            </div>
        </div>
    );
}

function LayRolls({ lay, rows, colourName }) {
    if (!rows.length) return <p className="px-4 py-3 text-sm text-slate-400">No rolls on this lay.</p>;
    return (
        <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
                <thead className="text-left text-xs font-bold text-slate-500 uppercase tracking-wider"><tr><th className="px-4 py-1.5">Roll</th><th className="px-2 py-1.5">Colour</th><th className="px-2 py-1.5">Shade · width</th><th className="px-2 py-1.5 text-right">Length</th><th className="px-2 py-1.5 text-right">Plies</th><th className="px-2 py-1.5 text-right">Uses</th><th className="px-4 py-1.5 text-right">End bit</th></tr></thead>
                <tbody>{rows.map(x => (
                    <tr key={x.key} className="border-t border-slate-100">
                        <td className="px-4 py-1.5 font-semibold">{x.label}{x.roll?.lay_piece && <span className="ml-1 text-[11px] font-bold text-amber-700">end bit</span>}</td>
                        <td className="px-2 py-1.5">{colourName.get(x.garment_colour_id)}</td>
                        <td className="px-2 py-1.5 text-xs">{x.shade_group || '—'}{x.width_group ? ` · ${x.width_group}` : ''}{x.roll ? ` · ${widthText(x.roll)}` : ''}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{x.length != null ? `${fmt(x.length, 2)} ${x.uom}` : '—'}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums font-bold">{x.planned_plies}{x.max_plies != null && x.max_plies !== x.planned_plies ? <span className="font-normal text-slate-400"> / {x.max_plies}</span> : ''}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{x.uses != null ? fmt(x.uses, 2) : '—'}</td>
                        <td className="px-4 py-1.5 text-right tabular-nums">{x.end_bit != null ? fmt(x.end_bit, 2) : '—'}</td>
                    </tr>
                ))}</tbody>
                <tfoot className="border-t-2 border-slate-200 bg-slate-50 text-xs font-bold text-slate-700"><tr><td className="px-4 py-1.5" colSpan={3}>Total {rows.length} roll{rows.length === 1 ? '' : 's'}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{qtyText(rows.reduce((a, x) => { if (x.length != null) a[x.uom] = (a[x.uom] || 0) + x.length; return a; }, {}))}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{lay.plies}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{qtyText(rows.reduce((a, x) => { if (x.uses != null) a[x.uom] = (a[x.uom] || 0) + x.uses; return a; }, {}))}</td>
                    <td className="px-4 py-1.5 text-right tabular-nums">{qtyText(rows.reduce((a, x) => { if (x.end_bit != null) a[x.uom] = (a[x.uom] || 0) + x.end_bit; return a; }, {}))}</td></tr></tfoot>
            </table>
        </div>
    );
}


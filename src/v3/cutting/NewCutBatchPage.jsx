// New cut batch for an order line: numbering mode, layer length, size ratio
// (typed by the cutting manager), rolls issued to cutting (colour per roll
// when the fabric serves several), with a preview of what the rolls can cut
// against what is still to cut per colour × size (over-cut warns, not blocks).
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Scissors, AlertTriangle } from 'lucide-react';
import { cuttingApi } from '../api/cuttingApi';
import { apiError } from '../api/mastersApi';
import { PageHeader, Field, inputCls, PrimaryButton, ErrorBox, Loading } from '../components/ui';
import { fmtDate } from '../salesOrders/SalesOrderStatusBadge';
import { OrderGrid, IN_TO_M, fmt } from './cutShared';

export default function NewCutBatchPage() {
    const { lineId } = useParams();
    const navigate = useNavigate();
    const [d, setD] = useState(null);
    const [mode, setMode] = useState('MODE_1');
    const [length, setLength] = useState('');
    const [ratio, setRatio] = useState({});
    const [picks, setPicks] = useState({});      // roll id → { colour, metres }
    const [notes, setNotes] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    useEffect(() => { cuttingApi.orderLine(lineId).then(res => setD(res.data)).catch(err => setError(apiError(err, 'Failed to load the order line.'))); }, [lineId]);

    const ratioSum = Object.values(ratio).reduce((s, v) => s + (Number(v) || 0), 0);
    const layM = Number(length) > 0 ? Number(length) * IN_TO_M : 0;
    // Preview: for each roll that cuts a MAIN part, max lays = metres ÷ layer → garments per colour × size.
    const preview = useMemo(() => {
        const extra = {};
        if (!d || !layM || !ratioSum) return extra;
        for (const [rid, p] of Object.entries(picks)) {
            const roll = d.rolls.find(r => r.id === rid);
            const colour = p.colour || (roll.colours.length === 1 ? roll.colours[0].id : null);
            if (!colour || !(roll.parts[colour] || []).some(x => x.part_type === 'MAIN')) continue;
            const lays = Math.floor((Number(p.metres) || roll.available) / layM + 1e-9);
            for (const [sid, v] of Object.entries(ratio)) if (Number(v) > 0) extra[`${colour}|${sid}`] = (extra[`${colour}|${sid}`] || 0) + lays * Number(v);
        }
        return extra;
    }, [d, picks, ratio, layM, ratioSum]);
    if (!d) return <div>{error ? <ErrorBox text={error} /> : <Loading />}</div>;
    const over = d.grid.cells.filter(c => (c.cut + (preview[`${c.colour_id}|${c.size_id}`] || 0)) > c.planned);
    const free = d.rolls.filter(r => r.available > 0);
    const save = async () => {
        setBusy(true); setError('');
        try {
            const res = await cuttingApi.create({ order_line_id: lineId, numbering_mode: mode, layer_length_in: Number(length), notes,
                ratios: Object.entries(ratio).filter(([, v]) => Number(v) > 0).map(([size_id, v]) => ({ size_id, ratio: Number(v) })),
                rolls: Object.entries(picks).map(([fabric_roll_id, p]) => ({ fabric_roll_id, garment_colour_id: p.colour || undefined, metres: p.metres === '' ? undefined : Number(p.metres) })) });
            navigate(`/v3/cutting/batches/${res.data.id}`);
        } catch (err) { setError(apiError(err, 'Failed to create the batch.')); setBusy(false); }
    };
    return (
        <div>
            <Link to="/v3/cutting" className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-indigo-600 mb-3"><ArrowLeft size={15} /> Cutting</Link>
            <PageHeader title={`New cut batch — ${d.line.order_no} line ${d.line.line_no}`} subtitle={`${d.line.customer_name} · ${d.line.style_code} ${d.line.style_name} · ships ${fmtDate(d.line.ship_date)}`} />
            <div className={`mb-3 text-sm rounded-lg px-3 py-2 border ${d.cutting_gate.allowed ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-rose-50 border-rose-200 text-rose-900'}`}><b>Cutting gate:</b> {d.cutting_gate.allowed ? (d.cutting_gate.ready ? 'open — all materials covered.' : `open by override — ${d.cutting_gate.reason}`) : `closed — ${d.cutting_gate.reason}`}</div>
            <div className="mb-4"><OrderGrid grid={d.grid} extra={preview} /></div>
            <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4 space-y-3">
                <div className="grid sm:grid-cols-3 gap-3">
                    <Field label="Piece numbering">
                        <select className={inputCls} value={mode} onChange={e => setMode(e.target.value)}><option value="MODE_1">Mode 1 — numbered per roll</option><option value="MODE_2">Mode 2 — continuous across rolls</option></select>
                    </Field>
                    <Field label="Layer length (inches) *" hint={layM ? `= ${fmt(layM, 2)} m per lay` : ' '}><input className={inputCls} type="number" min="1" step="0.01" value={length} onChange={e => setLength(e.target.value)} /></Field>
                    <Field label="Notes"><input className={inputCls} value={notes} onChange={e => setNotes(e.target.value)} /></Field>
                </div>
                <div>
                    <p className="text-xs font-bold text-slate-600 mb-1">Size ratio * <span className="font-normal text-slate-500">({ratioSum} garments per lay)</span></p>
                    <div className="flex flex-wrap gap-2">{d.grid.sizes.map(s => (
                        <label key={s.id} className="text-sm text-center"><span className="block text-xs font-bold text-slate-600">{s.name}</span>
                            <input className={`${inputCls} !w-16 text-center`} type="number" min="0" step="1" value={ratio[s.id] || ''} onChange={e => setRatio({ ...ratio, [s.id]: e.target.value })} aria-label={`Ratio ${s.name}`} /></label>
                    ))}</div>
                </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto mb-4">
                <table className="w-full text-sm min-w-[860px]">
                    <thead className="bg-slate-50 text-left text-xs font-bold text-slate-500 uppercase tracking-wider"><tr><th className="px-3 py-2 w-8" /><th className="px-3 py-2">Roll</th><th className="px-3 py-2">Fabric</th><th className="px-3 py-2">Cuts for colour → parts</th><th className="px-3 py-2 text-right">Free at cutting</th><th className="px-3 py-2 w-32">Take (m)</th><th className="px-3 py-2 text-right">Max lays</th></tr></thead>
                    <tbody>
                        {free.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">No fabric issued to cutting for this order with metres free. Issue it first (Material issue).</td></tr>}
                        {free.map(r => {
                            const p = picks[r.id];
                            const colour = p?.colour || (r.colours.length === 1 ? r.colours[0].id : '');
                            const m = p ? (p.metres === '' ? r.available : Number(p.metres) || 0) : r.available;
                            return (
                                <tr key={r.id} className={`border-t border-slate-100 ${p ? 'bg-indigo-50/40' : ''}`}>
                                    <td className="px-3 py-2"><input type="checkbox" checked={Boolean(p)} onChange={e => setPicks(x => { const n = { ...x }; if (e.target.checked) n[r.id] = { colour: r.colours.length === 1 ? r.colours[0].id : '', metres: '' }; else delete n[r.id]; return n; })} aria-label={`Use roll ${r.roll_no}`} /></td>
                                    <td className="px-3 py-2 font-semibold">{r.roll_no}{r.dye_lot && <span className="block text-xs font-normal text-slate-500">lot {r.dye_lot}</span>}</td>
                                    <td className="px-3 py-2 text-xs">{r.fabric_label}{r.width ? ` · ${r.width} ${r.width_unit}` : ''}</td>
                                    <td className="px-3 py-2 text-xs">
                                        {r.colours.length > 1 && p ? <select className={`${inputCls} !py-1`} value={p.colour} onChange={e => setPicks({ ...picks, [r.id]: { ...p, colour: e.target.value } })} aria-label="Garment colour"><option value="">Choose colour…</option>{r.colours.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
                                            : r.colours.map(c => c.name).join(' / ')}
                                        {colour && <span className="block text-slate-500">{(r.parts[colour] || []).map(x => x.part_name).join(', ')}</span>}
                                    </td>
                                    <td className="px-3 py-2 text-right tabular-nums">{fmt(r.available)} m</td>
                                    <td className="px-3 py-2">{p && <input className={`${inputCls} !py-1`} type="number" min="0" max={r.available} step="any" placeholder={String(r.available)} value={p.metres} onChange={e => setPicks({ ...picks, [r.id]: { ...p, metres: e.target.value } })} aria-label="Metres" />}</td>
                                    <td className="px-3 py-2 text-right tabular-nums">{layM ? Math.floor(m / layM + 1e-9) : '—'}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            {over.length > 0 && <p className="mb-3 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-start gap-1.5"><AlertTriangle size={15} className="mt-0.5" />At full lays these rolls would cut more than planned for {over.length} colour × size cell(s). That's allowed — the cutter enters the lays actually made.</p>}
            <ErrorBox text={error} />
            <PrimaryButton onClick={save} busy={busy} disabled={busy || !d.cutting_gate.allowed || !ratioSum || !(Number(length) > 0) || !Object.keys(picks).length || Object.entries(picks).some(([rid, p]) => !p.colour && d.rolls.find(r => r.id === rid).colours.length > 1)}><Scissors size={15} /> Create batch</PrimaryButton>
        </div>
    );
}

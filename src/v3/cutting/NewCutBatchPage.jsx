// New cut batch for an order line: numbering mode, layer length, size ratio
// (typed by the cutting manager), rolls issued to cutting (colour per roll
// when the fabric serves several), with a preview of what the rolls can cut
// against what is still to cut per colour × size (over-cut warns, not blocks).
// 19 Oct 2026 (phase 3): the order's lay pieces (end bits) are offered next to the rolls — used whole, on this batch's
// marker; the replacement reserve pieces stay off batches.
// 20 Oct 2026: filters on the roll list (roll / lot search, fabric, colour, dye lot, width, selected) and a
// "select all shown" box — picks survive filtering; a colour filter pre-chooses that colour on multi-colour rolls.
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Scissors, AlertTriangle } from 'lucide-react';
import { cuttingApi } from '../api/cuttingApi';
import { apiError } from '../api/mastersApi';
import { PageHeader, Field, inputCls, PrimaryButton, ErrorBox, Loading, SearchInput } from '../components/ui';
import { fmtDate } from '../salesOrders/SalesOrderStatusBadge';
import { OrderGrid, perLay, layerText, fmt } from './cutShared';

export default function NewCutBatchPage() {
    const { lineId } = useParams();
    const navigate = useNavigate();
    const [d, setD] = useState(null);
    const [mode, setMode] = useState('MODE_1');
    const [length, setLength] = useState('');
    const [ratio, setRatio] = useState({});
    const [picks, setPicks] = useState({});      // roll id → { colour, metres }
    const [ebPicks, setEbPicks] = useState([]);   // lay piece (end bit) ids
    const [notes, setNotes] = useState('');
    const [filter, setFilter] = useState({ q: '', fabric: '', colour: '', lot: '', width: '', show: '' });
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    useEffect(() => { cuttingApi.orderLine(lineId).then(res => setD(res.data)).catch(err => setError(apiError(err, 'Failed to load the order line.'))); }, [lineId]);

    const ratioSum = Object.values(ratio).reduce((s, v) => s + (Number(v) || 0), 0);
    const hasLength = Number(length) > 0;
    // Preview: for each roll that cuts a MAIN part, max lays = roll quantity ÷ one lay (in the roll's unit) → garments per colour × size.
    const preview = useMemo(() => {
        const extra = {};
        if (!d || !hasLength || !ratioSum) return extra;
        for (const [rid, p] of Object.entries(picks)) {
            const roll = d.rolls.find(r => r.id === rid);
            const colour = p.colour || (roll.colours.length === 1 ? roll.colours[0].id : null);
            if (!colour || !(roll.parts[colour] || []).some(x => x.part_type === 'MAIN')) continue;
            const lay = perLay(length, roll.uom);
            if (!lay) continue;   // kg fabric: no lay length
            const lays = Math.floor((Number(p.metres) || roll.available) / lay + 1e-9);
            for (const [sid, v] of Object.entries(ratio)) if (Number(v) > 0) extra[`${colour}|${sid}`] = (extra[`${colour}|${sid}`] || 0) + lays * Number(v);
        }
        for (const id of ebPicks) {
            const e = (d.end_bits || []).find(x => x.id === id);
            const lay = e && perLay(length, e.uom);
            if (!lay || !(e.parts || []).some(x => x.part_type === 'MAIN')) continue;
            const lays = Math.floor(e.metres / lay + 1e-9);
            for (const [sid, v] of Object.entries(ratio)) if (Number(v) > 0) extra[`${e.colour_id}|${sid}`] = (extra[`${e.colour_id}|${sid}`] || 0) + lays * Number(v);
        }
        return extra;
    }, [d, picks, ebPicks, ratio, length, hasLength, ratioSum]);
    if (!d) return <div>{error ? <ErrorBox text={error} /> : <Loading />}</div>;
    const over = d.grid.cells.filter(c => (c.cut + (preview[`${c.colour_id}|${c.size_id}`] || 0)) > c.planned);
    const free = d.rolls.filter(r => r.available > 0);
    // Filter choices from the free rolls themselves; a filter shows only when it has more than one choice.
    const uniq = (pairs) => [...new Map(pairs.filter(([k]) => k != null && k !== '').map(([k, v]) => [String(k), v])).entries()].sort((a, b) => String(a[1]).localeCompare(String(b[1]), undefined, { numeric: true }));
    const widthKey = (r) => (r.width ? `${r.width} ${r.width_unit || ''}`.trim() : '');
    const opts = {
        fabric: uniq(free.map(r => [r.fabric_item_id, r.fabric_label])),
        colour: uniq(free.flatMap(r => r.colours.map(c => [c.id, c.name]))),
        lot: uniq(free.map(r => [r.dye_lot, r.dye_lot])),
        width: uniq(free.map(r => [widthKey(r), widthKey(r)])),
    };
    const q = filter.q.trim().toLowerCase();
    const shown = free.filter(r => (!q || `${r.roll_no} ${r.dye_lot || ''}`.toLowerCase().includes(q))
        && (!filter.fabric || String(r.fabric_item_id) === filter.fabric)
        && (!filter.colour || r.colours.some(c => String(c.id) === filter.colour))
        && (!filter.lot || String(r.dye_lot) === filter.lot)
        && (!filter.width || widthKey(r) === filter.width)
        && (!filter.show || (filter.show === 'picked') === Boolean(picks[r.id])));
    const filtered = shown.length !== free.length;
    const pickedCount = Object.keys(picks).length;
    const hiddenPicked = Object.keys(picks).filter(id => !shown.some(r => r.id === id)).length;
    const pickedQty = Object.entries(picks).reduce((s, [rid]) => { const r = free.find(x => x.id === rid); if (r) s[r.uom] = (s[r.uom] || 0) + r.available; return s; }, {});
    // New pick: one colour → that one; several → the colour filter's, if the roll cuts it.
    const newPick = (r) => ({ colour: r.colours.length === 1 ? r.colours[0].id : (r.colours.find(c => String(c.id) === filter.colour)?.id ?? ''), metres: '' });
    const allShownPicked = shown.length > 0 && shown.every(r => picks[r.id]);
    const pickShown = (on) => setPicks(x => { const n = { ...x }; for (const r of shown) { if (on) n[r.id] = n[r.id] || newPick(r); else delete n[r.id]; } return n; });
    const setF = (k) => (v) => setFilter(f => ({ ...f, [k]: v }));
    const save = async () => {
        setBusy(true); setError('');
        try {
            const res = await cuttingApi.create({ order_line_id: lineId, numbering_mode: mode, layer_length_in: Number(length), notes,
                ratios: Object.entries(ratio).filter(([, v]) => Number(v) > 0).map(([size_id, v]) => ({ size_id, ratio: Number(v) })),
                rolls: [...Object.entries(picks).map(([fabric_roll_id, p]) => ({ fabric_roll_id, garment_colour_id: p.colour || undefined })), ...ebPicks.map(end_bit_id => ({ end_bit_id }))] });   // whole rolls + lay pieces (19 Oct 2026)
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
                    <Field label="Layer length (inches) *" hint={hasLength ? `= ${layerText(Number(length))} per lay` : ' '}><input className={inputCls} type="number" min="1" step="0.01" value={length} onChange={e => setLength(e.target.value)} /></Field>
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
            {free.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 mb-2">
                    <SearchInput value={filter.q} onChange={setF('q')} placeholder="Roll no. or lot" />
                    {opts.fabric.length > 1 && <select className={`${inputCls} !w-auto max-w-xs`} value={filter.fabric} onChange={e => setF('fabric')(e.target.value)} aria-label="Fabric"><option value="">All fabrics</option>{opts.fabric.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>}
                    {opts.colour.length > 1 && <select className={`${inputCls} !w-auto`} value={filter.colour} onChange={e => setF('colour')(e.target.value)} aria-label="Colour"><option value="">All colours</option>{opts.colour.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>}
                    {opts.lot.length > 1 && <select className={`${inputCls} !w-auto`} value={filter.lot} onChange={e => setF('lot')(e.target.value)} aria-label="Dye lot"><option value="">All lots</option>{opts.lot.map(([k, v]) => <option key={k} value={k}>Lot {v}</option>)}</select>}
                    {opts.width.length > 1 && <select className={`${inputCls} !w-auto`} value={filter.width} onChange={e => setF('width')(e.target.value)} aria-label="Width"><option value="">All widths</option>{opts.width.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>}
                    <select className={`${inputCls} !w-auto`} value={filter.show} onChange={e => setF('show')(e.target.value)} aria-label="Selected"><option value="">All rolls</option><option value="picked">Selected</option><option value="unpicked">Not selected</option></select>
                    {filtered && <button type="button" className="text-xs font-semibold text-indigo-700 hover:underline" onClick={() => setFilter({ q: '', fabric: '', colour: '', lot: '', width: '', show: '' })}>Clear filters</button>}
                    <span className="ml-auto text-xs text-slate-500">
                        {filtered ? `${shown.length} of ${free.length} rolls` : `${free.length} rolls`}
                        {pickedCount > 0 && <> · <b className="text-slate-700">{pickedCount} selected</b> ({Object.entries(pickedQty).map(([u, v]) => `${fmt(v)} ${u}`).join(' + ')}){hiddenPicked > 0 && <span className="text-amber-700"> · {hiddenPicked} hidden by filters</span>}</>}
                    </span>
                </div>
            )}
            <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto mb-4">
                <table className="w-full text-sm min-w-[860px]">
                    <thead className="bg-slate-50 text-left text-xs font-bold text-slate-500 uppercase tracking-wider"><tr><th className="px-3 py-2 w-8">{shown.length > 0 && <input type="checkbox" checked={allShownPicked} onChange={e => pickShown(e.target.checked)} aria-label={filtered ? 'Select all shown rolls' : 'Select all rolls'} title={filtered ? 'Select all shown rolls' : 'Select all rolls'} />}</th><th className="px-3 py-2">Roll</th><th className="px-3 py-2">Fabric</th><th className="px-3 py-2">Cuts for colour → parts</th><th className="px-3 py-2 text-right">Free at cutting</th><th className="px-3 py-2 w-32">Take</th><th className="px-3 py-2 text-right">Max lays</th></tr></thead>
                    <tbody>
                        {free.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">No fabric issued to cutting for this order with anything free. Issue it first (Material issue).</td></tr>}
                        {free.length > 0 && shown.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">No rolls match these filters.</td></tr>}
                        {shown.map(r => {
                            const p = picks[r.id];
                            const colour = p?.colour || (r.colours.length === 1 ? r.colours[0].id : '');
                            const m = p ? (p.metres === '' ? r.available : Number(p.metres) || 0) : r.available;
                            return (
                                <tr key={r.id} className={`border-t border-slate-100 ${p ? 'bg-indigo-50/40' : ''}`}>
                                    <td className="px-3 py-2"><input type="checkbox" checked={Boolean(p)} onChange={e => setPicks(x => { const n = { ...x }; if (e.target.checked) n[r.id] = newPick(r); else delete n[r.id]; return n; })} aria-label={`Use roll ${r.roll_no}`} /></td>
                                    <td className="px-3 py-2 font-semibold">{r.roll_no}{r.dye_lot && <span className="block text-xs font-normal text-slate-500">lot {r.dye_lot}</span>}</td>
                                    <td className="px-3 py-2 text-xs">{r.fabric_label}{r.width ? ` · ${r.width} ${r.width_unit}` : ''}</td>
                                    <td className="px-3 py-2 text-xs">
                                        {r.colours.length > 1 && p ? <select className={`${inputCls} !py-1`} value={p.colour} onChange={e => setPicks({ ...picks, [r.id]: { ...p, colour: e.target.value } })} aria-label="Garment colour"><option value="">Choose colour…</option>{r.colours.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
                                            : r.colours.map(c => c.name).join(' / ')}
                                        {colour && <span className="block text-slate-500">{(r.parts[colour] || []).map(x => x.part_name).join(', ')}</span>}
                                    </td>
                                    <td className="px-3 py-2 text-right tabular-nums">{fmt(r.available)} {r.uom}</td>
                                    <td className="px-3 py-2 text-xs font-semibold text-slate-600">{p ? 'whole roll' : ''}</td>
                                    <td className="px-3 py-2 text-right tabular-nums">{perLay(length, r.uom) ? Math.floor(m / perLay(length, r.uom) + 1e-9) : '—'}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            {(d.end_bits || []).length > 0 && (
                <div className="bg-white border border-amber-200 rounded-xl overflow-x-auto mb-4">
                    <p className="px-3 pt-2.5 text-xs font-black uppercase tracking-wider text-amber-800">End bits of this order — lay pieces</p>
                    <p className="px-3 pb-1.5 text-xs text-slate-500">Used whole, laid with this batch's marker. Pieces too short for a lay stay for a small-marker batch or replacements.</p>
                    <table className="w-full text-sm min-w-[760px]">
                        <thead className="bg-amber-50 text-left text-xs font-bold text-slate-500 uppercase tracking-wider"><tr><th className="px-3 py-2 w-8" /><th className="px-3 py-2">End bit</th><th className="px-3 py-2">Fabric</th><th className="px-3 py-2">Colour → parts</th><th className="px-3 py-2 text-right">Length</th><th className="px-3 py-2 text-right">Max lays</th></tr></thead>
                        <tbody>{d.end_bits.map(e => {
                            const on = ebPicks.includes(e.id);
                            const lay = perLay(length, e.uom);
                            return (
                                <tr key={e.id} className={`border-t border-slate-100 ${on ? 'bg-amber-50/60' : ''}`}>
                                    <td className="px-3 py-2"><input type="checkbox" checked={on} onChange={ev => setEbPicks(x => (ev.target.checked ? [...x, e.id] : x.filter(y => y !== e.id)))} aria-label={`Use end bit ${e.tag}`} /></td>
                                    <td className="px-3 py-2 font-semibold">{e.tag}{e.source_floor_no && <span className="block text-xs font-normal text-slate-500">from batch #{e.source_floor_no}</span>}</td>
                                    <td className="px-3 py-2 text-xs">{e.fabric_label}</td>
                                    <td className="px-3 py-2 text-xs">{e.colour}<span className="block text-slate-500">{(e.parts || []).map(x => x.part_name).join(', ')}</span></td>
                                    <td className="px-3 py-2 text-right tabular-nums">{fmt(e.metres)} {e.uom}</td>
                                    <td className={`px-3 py-2 text-right tabular-nums ${lay && Math.floor(e.metres / lay + 1e-9) === 0 ? 'text-rose-700 font-bold' : ''}`}>{lay ? Math.floor(e.metres / lay + 1e-9) : '—'}</td>
                                </tr>
                            );
                        })}</tbody>
                    </table>
                </div>
            )}
            {over.length > 0 && <p className="mb-3 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-start gap-1.5"><AlertTriangle size={15} className="mt-0.5" />At full lays these rolls would cut more than planned for {over.length} colour × size cell(s). That's allowed — the cutter enters the lays actually made.</p>}
            <ErrorBox text={error} />
            <PrimaryButton onClick={save} busy={busy} disabled={busy || !d.cutting_gate.allowed || !ratioSum || !(Number(length) > 0) || !(Object.keys(picks).length || ebPicks.length) || Object.entries(picks).some(([rid, p]) => !p.colour && d.rolls.find(r => r.id === rid).colours.length > 1)}><Scissors size={15} /> Create batch</PrimaryButton>
        </div>
    );
}

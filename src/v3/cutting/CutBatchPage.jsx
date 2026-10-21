// One cut batch: ratio, layer length, numbering; rolls with lays, end bits,
// fabric check (expected vs used); cut / re-cut per roll (operator), pieces
// per colour × part × size with number ranges, the order grid with over-cut
// warnings, finalise (→ numbering check), cancel, history, cut sheet PDF.
// 19 Oct 2026 (phase 3): a roll's end bit becomes the order's end-bit pieces (reserve R / lay L tags shown under the
// roll); the order's lay pieces can be added like rolls (cut whole); what a lay piece leaves is a new lay piece.
// 20 Oct 2026 ("Over-cut and trims"): garments above the order — preview while cutting; above the free limit the
// finalise asks the reason; the merchandiser approves / refuses here or on the Over-cut page.
// 20 Oct 2026 (pocketing / lining): the batch's counted Pocket / Lining pieces — needed, handed with the batch from the
// order's pocket stock (Hand over), replacements.
// 21 Oct 2026 (undo finalise): a finalised batch goes back to cutting (reason) while nothing of it has moved on.
// 21 Oct 2026 (owner: "on finalise … force user to allot pockets mandatorily"): Finalise opens a dialog — fabric
// warnings, over-cut (reason above the free limit) and the batch's pockets / lining from the order's pocket stock: short
// → can't finalise (cut a lay first); otherwise ticked as put with the batch and handed over with the finalise.
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Scissors, CheckCircle2, Ban, Plus, Trash2, FileDown, Pencil, AlertTriangle, Undo2 } from 'lucide-react';
import Modal from '../../shared/Modal';
import { cuttingApi } from '../api/cuttingApi';
import { apiError } from '../api/mastersApi';
import { Field, inputCls, PrimaryButton, SecondaryButton, ErrorBox, Loading } from '../components/ui';
import { CUT_STATUS, OrderGrid, perLay, layerText, fmt, useCuttingPermissions, PriorityBadge, PRIORITY, Section, TONE } from './cutShared';
import { exportCutSheet, exportLaySheet } from './cutPrint';
import { loadLetterhead } from '../components/letterhead';
import { OverCutPanel, OverCutCells } from './overCutShared';

// Pocket / Lining pieces of a cut batch: handed over with it from the order's pocket stock (Pocketing & lining page).
function PocketsPanel({ b, canManage, onChanged }) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [note, setNote] = useState('');
    const [rep, setRep] = useState(null);   // { line, qty, reason }
    if (!b.pockets?.length) return null;
    const short = b.pockets.reduce((a, x) => a + x.short, 0);
    const hand = async () => {
        setBusy(true); setError(''); setNote('');
        try { const r = await cuttingApi.handPockets(b.id); setNote(r.data.short.length ? `Short: ${r.data.short.join(', ')} — cut another pocketing lay.` : ''); onChanged(); }
        catch (err) { setError(apiError(err, 'Failed.')); } finally { setBusy(false); }
    };
    const replace = async () => {
        setBusy(true); setError('');
        try { await cuttingApi.replacePocket(b.id, { fabric_item_id: rep.line.fabric_item_id, part_id: rep.line.part_id, size_id: rep.line.size_id, qty: Number(rep.qty), reason: rep.reason }); setRep(null); onChanged(); }
        catch (err) { setError(apiError(err, 'Failed.')); } finally { setBusy(false); }
    };
    return (
        <div className={`mb-4 rounded-xl border px-4 py-3 ${short ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-white'}`}>
            <div className="flex flex-wrap items-center gap-2 mb-2">
                <p className="font-black text-slate-800">Pockets & lining with this batch</p>
                <span className="text-xs text-slate-600">{short ? `${short} piece(s) still to hand over` : 'all handed over'}</span>
                <Link to={`/v3/cutting/pocketing?order=${b.order_id}`} className="text-xs font-bold text-indigo-700 hover:underline">Order's pocket stock →</Link>
                {canManage && short > 0 && <PrimaryButton onClick={hand} busy={busy} disabled={busy}>Hand over with the batch</PrimaryButton>}
            </div>
            <ErrorBox text={error} />
            {note && <p className="text-sm font-semibold text-amber-800 mb-1">{note}</p>}
            {(() => {
                // Part × size rows (part merged), one column group per pocketing / lining fabric (21 Oct 2026, owner's layout).
                const fabrics = [...new Map(b.pockets.map(x => [x.fabric_item_id, { id: x.fabric_item_id, label: x.fabric }])).values()];
                const parts = [...new Map(b.pockets.map(x => [x.part_id, { id: x.part_id, name: x.part_name, per: x.per_garment }])).values()];
                const cell = new Map(b.pockets.map(x => [`${x.fabric_item_id}|${x.part_id}|${x.size_id}`, x]));
                const sizesOf = (pid) => [...new Map(b.pockets.filter(x => x.part_id === pid).sort((a, c) => a.size_order - c.size_order).map(x => [x.size_id, { id: x.size_id, name: x.size }])).values()];
                const cols = ['Garments', 'Needed', 'Handed', 'Replaced', 'Short', 'Order stock', ...(canManage ? [''] : [])];
                const th = 'px-2 py-1.5 border border-slate-200';
                const td = 'px-2 py-1.5 border border-slate-200 text-right tabular-nums';
                return (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm border-collapse bg-white">
                            <thead className="text-xs font-bold text-slate-600 uppercase">
                                <tr>
                                    <th rowSpan={2} className={`${th} text-left`}>Part</th><th rowSpan={2} className={`${th} text-left`}>Size</th>
                                    {fabrics.map(f => <th key={f.id} colSpan={cols.length} className={`${th} text-center normal-case text-sm text-slate-800`}>{f.label}</th>)}
                                </tr>
                                <tr>{fabrics.map(f => cols.map((c, i) => <th key={`${f.id}|${i}`} className={`${th} text-right whitespace-nowrap`}>{c}</th>))}</tr>
                            </thead>
                            <tbody>{parts.map(pt => sizesOf(pt.id).map((sz, i, arr) => (
                                <tr key={`${pt.id}|${sz.id}`}>
                                    {i === 0 && <td rowSpan={arr.length} className={`${td} text-left align-middle font-semibold whitespace-nowrap`}>{pt.name}<span className="block text-xs font-normal text-slate-500">{pt.per || 1} per garment</span></td>}
                                    <td className={`${td} font-bold`}>{sz.name}</td>
                                    {fabrics.map(f => {
                                        const x = cell.get(`${f.id}|${pt.id}|${sz.id}`);
                                        if (!x) return cols.map((c, j) => <td key={`${f.id}|${j}`} className={td} />);
                                        return [
                                            <td key="g" className={td}>{x.garments}</td>,
                                            <td key="n" className={td}>{x.need}</td>,
                                            <td key="h" className={`${td} font-semibold`}>{x.handed}</td>,
                                            <td key="r" className={td}>{x.replaced || '—'}</td>,
                                            <td key="s" className={`${td} ${x.short ? 'text-rose-700 font-bold' : 'text-emerald-700'}`}>{x.short || '✓'}</td>,
                                            <td key="o" className={td}>{x.stock_left}</td>,
                                            ...(canManage ? [<td key="b" className={`${td} text-center`}><button type="button" className="text-xs font-bold text-indigo-700 hover:underline" onClick={() => { setError(''); setRep({ line: x, qty: '1', reason: '' }); }}>Replace</button></td>] : []),
                                        ];
                                    })}
                                </tr>
                            )))}</tbody>
                        </table>
                    </div>
                );
            })()}
            {rep && (
                <Modal title={`Replace ${rep.line.part_name} ${rep.line.size} — ${rep.line.fabric}`} onClose={() => setRep(null)}>
                    <div className="space-y-3 w-[min(420px,90vw)]">
                        <p className="text-sm text-slate-600">From the order's pocket stock ({rep.line.stock_left} in stock). None left? Cut a small lay from the pocketing left at cutting first.</p>
                        <Field label="Pieces"><input className={inputCls} type="number" min="1" value={rep.qty} onChange={e => setRep({ ...rep, qty: e.target.value })} /></Field>
                        <Field label="Reason *"><input className={inputCls} value={rep.reason} onChange={e => setRep({ ...rep, reason: e.target.value })} placeholder="torn, missing…" /></Field>
                        <ErrorBox text={error} />
                        <div className="flex justify-end gap-2"><SecondaryButton onClick={() => setRep(null)}>Back</SecondaryButton><PrimaryButton onClick={replace} busy={busy} disabled={busy || !(Number(rep.qty) > 0) || !rep.reason.trim()}>Replace</PrimaryButton></div>
                    </div>
                </Modal>
            )}
        </div>
    );
}

const EB_TONE = { RESERVE: 'bg-violet-50 text-violet-800 border-violet-300', LAY: 'bg-amber-50 text-amber-800 border-amber-300', OFF: 'bg-slate-50 text-slate-500 border-slate-200 line-through' };
const ebChip = (e, uom) => (
    <span key={e.id} title={e.status === 'WRITTEN_OFF' ? 'Written off (under 0.3 m)' : e.kind === 'RESERVE' ? 'Replacement reserve — tag and keep aside' : 'Lay piece — for the next batch'}
        className={`inline-block whitespace-nowrap mr-1 mt-0.5 text-[10px] font-black px-1.5 py-0.5 rounded border ${e.status === 'WRITTEN_OFF' ? EB_TONE.OFF : EB_TONE[e.kind]}`}>{e.tag} {fmt(e.metres)} {uom}</span>
);
// This batch's garments per `colour|size` (lays × size ratio of each cut roll) — the "this batch" share in the order grid.
const batchGarments = (b) => {
    const out = {};
    for (const r of b.rolls) {
        if (!r.lays || !r.garment_colour_id) continue;
        for (const x of b.ratios) { const k = `${r.garment_colour_id}|${x.size_id}`; out[k] = (out[k] || 0) + r.lays * x.ratio; }
    }
    return out;
};

// Pieces cut on this batch (20 Oct 2026): one summary row per colour — garments per size, total garments, pieces —
// with a Total row; tap a colour for its parts × size, with the piece numbers.
function BatchPieces({ rows, sizeOrder }) {
    const [openColour, setOpenColour] = useState(null);
    if (!rows.length) return <div className="px-4 py-6 text-center text-sm text-slate-400">Nothing cut yet.</div>;
    const t0 = TONE.amber;
    const sizes = [...new Set([...sizeOrder.filter(s => rows.some(p => p.size === s)), ...rows.map(p => p.size)])];
    const colours = [...new Set(rows.map(p => p.colour))];
    const garmentsOf = (c, s) => {   // = the MAIN parts' count (every MAIN part is cut once per garment)
        const list = rows.filter(p => p.colour === c && p.size === s);
        const main = list.filter(p => p.part_type === 'MAIN');
        return Math.max(0, ...(main.length ? main : list).map(p => p.pieces));
    };
    const piecesOf = (c) => rows.filter(p => p.colour === c).reduce((s, p) => s + p.pieces, 0);
    const garmentsTotal = (c) => sizes.reduce((s, z) => s + garmentsOf(c, z), 0);
    const sizeTotal = (z) => colours.reduce((s, c) => s + garmentsOf(c, z), 0);
    const totalG = colours.reduce((s, c) => s + garmentsTotal(c), 0);
    const totalP = rows.reduce((s, p) => s + p.pieces, 0);
    return (
        <div className="overflow-x-auto">
            <table className="w-full text-sm">
                <thead className={`${t0.head} text-xs font-bold uppercase tracking-wider`}>
                    <tr><th className="px-3 py-2 text-left">Colour</th>{sizes.map(s => <th key={s} className="px-3 py-2 text-right">{s}</th>)}<th className="px-3 py-2 text-right border-l border-slate-200">Garments</th><th className="px-3 py-2 text-right">Pieces</th></tr>
                </thead>
                <tbody>
                    {colours.map(c => {
                        const isOpen = openColour === c;
                        const parts = [...new Map(rows.filter(p => p.colour === c).map(p => [p.part_name, p.part_type])).entries()];
                        return [
                            <tr key={c} className={`border-t border-slate-100 cursor-pointer hover:bg-slate-50 ${isOpen ? 'bg-slate-50' : ''}`} onClick={() => setOpenColour(isOpen ? null : c)}>
                                <td className="px-3 py-2 font-semibold whitespace-nowrap">
                                    <button type="button" className="inline-flex items-center gap-1" aria-expanded={isOpen} aria-label={`${isOpen ? 'Hide' : 'Show'} ${c} parts`}>
                                        <span className={`inline-block text-slate-400 transition-transform ${isOpen ? 'rotate-90' : ''}`}>▸</span>{c}
                                    </button>
                                    <span className="block pl-4 text-[11px] font-normal text-slate-400">{parts.length} parts</span>
                                </td>
                                {sizes.map(s => { const g = garmentsOf(c, s); return <td key={s} className="px-3 py-2 text-right tabular-nums">{g ? fmt(g) : <span className="text-slate-300">—</span>}</td>; })}
                                <td className="px-3 py-2 text-right tabular-nums font-bold border-l border-slate-200">{fmt(garmentsTotal(c))}</td>
                                <td className="px-3 py-2 text-right tabular-nums">{fmt(piecesOf(c))}</td>
                            </tr>,
                            ...(isOpen ? parts.map(([part, type]) => {
                                const list = rows.filter(p => p.colour === c && p.part_name === part);
                                const total = list.reduce((s, p) => s + p.pieces, 0);
                                const recut = list.reduce((s, p) => s + (p.recut || 0), 0);
                                return (
                                    <tr key={`${c}-${part}`} className="bg-slate-50 text-xs">
                                        <td className="pl-8 pr-3 py-1 font-semibold text-slate-600 whitespace-nowrap">{part}{type === 'SUPPORTING' && <span className="font-normal text-slate-400"> (supporting)</span>}{recut > 0 && <span className="block font-normal text-rose-700">{recut} re-cut</span>}</td>
                                        {sizes.map(s => { const p = list.find(x => x.size === s); return <td key={s} className="px-3 py-1 text-right tabular-nums">{p ? <>{fmt(p.pieces)}<span className="block text-[10px] text-slate-400">#{p.first_no}–{p.last_no}</span></> : ''}</td>; })}
                                        <td className="px-3 py-1 border-l border-slate-200" />
                                        <td className="px-3 py-1 text-right tabular-nums">{fmt(total)}</td>
                                    </tr>
                                );
                            }) : []),
                        ];
                    })}
                </tbody>
                <tfoot className={`${t0.foot} border-t-2 font-bold`}>
                    <tr>
                        <td className="px-3 py-2">Total garments</td>
                        {sizes.map(s => <td key={s} className="px-3 py-2 text-right tabular-nums">{fmt(sizeTotal(s))}</td>)}
                        <td className="px-3 py-2 text-right tabular-nums border-l border-slate-200">{fmt(totalG)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmt(totalP)}</td>
                    </tr>
                </tfoot>
            </table>
            <p className="px-3 py-1.5 text-[11px] text-slate-500 border-t border-slate-100">Garments per size (= main-part pieces) — tap a colour for each part's pieces and piece numbers.</p>
        </div>
    );
}

const ACTION = { PRIORITY: 'Priority', CREATED: 'Created', EDITED: 'Edited', ROLL_ADDED: 'Roll added', ROLL_REMOVED: 'Roll removed', ROLL_CUT: 'Roll cut', ROLL_RECUT: 'Roll re-cut', END_BIT: 'End bit', FINALIZED: 'Finalised', CANCELLED: 'Cancelled', OVER_CUT: 'Over-cut', POCKETS: 'Pockets & lining', UNFINALIZED: 'Back to cutting' };

export default function CutBatchPage() {
    const { id } = useParams();
    const perms = useCuttingPermissions();
    const [b, setB] = useState(null);
    const [error, setError] = useState('');
    const [cut, setCut] = useState(null);       // { roll, lays, end, reason }
    const [edit, setEdit] = useState(null);
    const [add, setAdd] = useState(null);       // { rolls (available), picks }
    const [cancel, setCancel] = useState(null);
    const [prio, setPrio] = useState(null);     // { priority, note }
    const [fin, setFin] = useState(null);       // finalise dialog: { reason, pockets (lines | null while loading), put }
    const [undo, setUndo] = useState(null);     // undo finalise: { plan, reason }
    const [formError, setFormError] = useState('');
    const [busy, setBusy] = useState(false);
    const load = useCallback(() => cuttingApi.batch(id).then(res => setB(res.data)).catch(err => setError(apiError(err, 'Failed to load the batch.'))), [id]);
    useEffect(() => { load(); }, [load]);
    if (!b) return <div>{error ? <ErrorBox text={error} /> : <Loading />}</div>;
    const open = ['DRAFT', 'CUTTING'].includes(b.status);
    const run = async (fn, close) => {
        setBusy(true); setFormError(''); setError('');
        try { setB((await fn()).data); if (close) close(); } catch (err) { (close ? setFormError : setError)(apiError(err, 'Failed.')); } finally { setBusy(false); }
    };
    // Company letterhead (name + logo) on the cutting documents.
    const printDoc = async (fn) => { const lh = await loadLetterhead(); fn(b, lh.company, { logo: lh.logo }); };
    const openAdd = async () => {
        setFormError('');
        try { const res = await cuttingApi.orderLine(b.order_line_id); setAdd({ rolls: res.data.rolls.filter(r => r.available > 0), ends: res.data.end_bits || [], picks: {}, ebPicks: [] }); } catch (err) { setError(apiError(err, 'Failed.')); }
    };
    return (
        <div>
            <Link to="/v3/cutting?tab=batches" className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-indigo-600 mb-3"><ArrowLeft size={15} /> Cut batches</Link>
            <div className="flex flex-wrap items-center gap-3 mb-1">
                <h1 className="text-2xl font-black text-slate-900"><span className="mr-2 px-2 py-0.5 rounded-lg bg-slate-900 text-white" title="Batch number on the pieces">#{b.floor_no}</span>{b.batch_code}</h1>
                <span className={`text-[11px] font-black px-2 py-0.5 rounded border ${CUT_STATUS[b.status].cls}`}>{CUT_STATUS[b.status].label}</span>
                <PriorityBadge p={b.priority} note={b.priority_note} always />
                {perms.priority && b.status !== 'CANCELLED' && <button type="button" className="text-xs font-semibold text-indigo-700 hover:underline" onClick={() => { setFormError(''); setPrio({ priority: String(b.priority), note: b.priority_note || '' }); }}>Set priority</button>}
                {b.priority_note && <span className="text-xs text-slate-500">— {b.priority_note}</span>}
            </div>
            <p className="text-sm text-slate-500 mb-1">{b.line.customer_name} · {b.line.style_code} {b.line.style_name} · {b.numbering_mode === 'MODE_2' ? 'numbering continuous across rolls (mode 2)' : 'numbering per roll (mode 1)'} · layer {b.layer_length_in} in ({layerText(b.layer_length_in)}) · ratio {b.ratios.map(r => `${r.size}:${r.ratio}`).join('  ')} ({b.ratio_sum}/lay)</p>
            {b.gate_override && <p className="text-sm text-rose-700 mb-1">Created under a release for cutting (order not fully allocated).</p>}
            {b.fabric_warnings?.length > 0 && (
                <div className="my-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    <p className="font-bold flex items-center gap-1.5"><AlertTriangle size={14} /> Fabric not accounted for ({fmt(b.totals.unaccounted_m)} {b.totals.uom || ''} in all)</p>
                    {b.fabric_warnings.map(w => <p key={w} className="text-xs">{w}</p>)}
                </div>
            )}
            {b.status === 'CANCELLED' && <p className="text-sm text-slate-600 mb-1"><b>Cancelled:</b> {b.cancelled_reason}</p>}
            <div className="flex flex-wrap gap-2 my-3">
                {perms.manage && b.status === 'DRAFT' && <SecondaryButton onClick={() => { setFormError(''); setEdit({ layer_length_in: String(b.layer_length_in), numbering_mode: b.numbering_mode, ratio: Object.fromEntries(b.ratios.map(r => [r.size_id, String(r.ratio)])) }); }}><Pencil size={14} /> Ratio / length</SecondaryButton>}
                {perms.manage && open && <SecondaryButton onClick={openAdd}><Plus size={14} /> Add rolls</SecondaryButton>}
                {perms.manage && b.status === 'CUTTING' && <PrimaryButton onClick={async () => {
                    setFormError(''); setFin({ reason: '', pockets: null, put: false });
                    try { const res = await cuttingApi.batchPockets(id); setFin(f => f && { ...f, pockets: res.data.lines }); } catch (err) { setFin(f => f && { ...f, pockets: [] }); setFormError(apiError(err, 'Could not load the pockets for this batch.')); }
                }} busy={busy} disabled={busy}><CheckCircle2 size={14} /> Finalise cutting</PrimaryButton>}
                {perms.manage && b.status === 'DRAFT' && <SecondaryButton onClick={() => { setFormError(''); setCancel(''); }}><Ban size={14} /> Cancel batch</SecondaryButton>}
                {perms.manage && b.status === 'CUT' && <SecondaryButton onClick={async () => {
                    setFormError(''); setError('');
                    try { setUndo({ plan: (await cuttingApi.unfinalizePreview(id)).data, reason: '' }); } catch (err) { setError(apiError(err, 'Failed.')); }
                }}><Undo2 size={14} /> Undo finalise</SecondaryButton>}
                <span className="ml-auto flex gap-2">
                    {/* Lay sheet (A5, 2.0's): for the cutting table — blank boxes before cutting, filled after */}
                    <SecondaryButton onClick={() => printDoc(exportLaySheet)}><FileDown size={14} /> Lay sheet</SecondaryButton>
                    {b.rolls.some(r => r.lays) && <SecondaryButton onClick={() => printDoc(exportCutSheet)}><FileDown size={14} /> Cut sheet</SecondaryButton>}
                </span>
            </div>
            <ErrorBox text={error} />
            {b.stages?.length > 0 && (
                <div className="mb-3 flex flex-wrap gap-2 text-xs">{b.stages.map(x => (
                    <span key={x.sequence_no} className={`px-2 py-1 rounded border ${x.status === 'COMPLETED' ? 'bg-emerald-50 border-emerald-300 text-emerald-800' : x.status === 'IN_PROGRESS' ? 'bg-amber-50 border-amber-300 text-amber-800' : 'bg-white border-slate-200 text-slate-500'}`}>
                        {x.sequence_no}. {x.name === 'Cutting' ? 'Numbering check' : x.name}: {x.status.toLowerCase().replace('_', ' ')}{x.line ? ` · ${x.line}` : ''}</span>
                ))}{b.recuts?.open > 0 && <span className="px-2 py-1 rounded border bg-rose-50 border-rose-300 text-rose-800">{b.recuts.open} re-cut(s) open</span>}</div>
            )}
            <div className="grid sm:grid-cols-4 gap-3 mb-6">
                {[['Rolls cut', `${b.totals.rolls_cut} / ${b.totals.rolls}`], ['Garments', b.totals.garments], ['Pieces', b.totals.pieces], ['Fabric', `${fmt(b.totals.consumed_m)} ${b.totals.uom || ''} used · ${fmt(b.totals.expected_m)} ${b.totals.uom || ''} by the lays`]].map(([k, v]) => (
                    <div key={k} className="bg-white border border-slate-200 rounded-xl p-3"><p className="text-xs font-bold text-slate-500">{k}</p><p className="font-black text-slate-800">{v}</p></div>
                ))}
            </div>
            <Section tone="indigo" title="Rolls on this batch" subtitle={`${b.totals.rolls_cut} of ${b.totals.rolls} cut · ${fmt(b.totals.metres)} ${b.totals.uom || ''} taken`}>
            <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[980px]">
                    <thead className={`${TONE.indigo.head} text-left text-xs font-bold uppercase tracking-wider`}><tr><th className="px-3 py-2">Roll no.</th><th className="px-3 py-2">Store tag</th><th className="px-3 py-2">Colour → parts</th><th className="px-3 py-2 text-right">Taken</th><th className="px-3 py-2 text-right">Lays</th><th className="px-3 py-2 text-right" title="Garments cut from the roll: lays × the size ratio (— for a roll that cuts no main part)">Garments</th><th className="px-3 py-2 text-right">Expected</th><th className="px-3 py-2 text-right">Used</th><th className="px-3 py-2 text-right">End bit</th><th className="px-3 py-2 text-right">Short</th><th className="px-3 py-2 text-right" title="Taken − lays × layer − end bit − short">Unaccounted</th><th className="px-3 py-2" /></tr></thead>
                    <tbody>
                        {b.rolls.map(r => (
                            <tr key={r.id} className="border-t border-slate-100">
                                <td className="px-3 py-2 text-lg font-black" title="Number on the pieces">{r.floor_roll_no}</td>
                                <td className="px-3 py-2 font-semibold">{r.roll_no}{r.end_bit_id && <span className="ml-1 text-[10px] font-black px-1.5 py-0.5 rounded border bg-amber-50 text-amber-800 border-amber-300">lay piece of roll {r.parent_roll_no}</span>}<span className="block text-xs font-normal text-slate-500">{r.dye_lot ? `lot ${r.dye_lot} · ` : ''}{r.fabric_label}</span></td>
                                <td className="px-3 py-2 text-xs">{r.colour}<span className="block text-slate-500">{r.parts.map(p => p.part_name).join(', ')}</span></td>
                                <td className="px-3 py-2 text-right tabular-nums">{fmt(r.metres)} {r.uom}</td>
                                <td className="px-3 py-2 text-right tabular-nums font-bold">{r.lays ?? '—'}</td>
                                <td className="px-3 py-2 text-right tabular-nums font-bold">{r.garments || '—'}</td>
                                <td className="px-3 py-2 text-right tabular-nums">{r.expected_m != null ? fmt(r.expected_m) : '—'}</td>
                                <td className={`px-3 py-2 text-right tabular-nums ${r.variance_m != null && Math.abs(r.variance_m) > r.metres * 0.03 ? 'text-amber-700 font-bold' : ''}`}>{r.consumed_m != null ? fmt(r.consumed_m) : '—'}{r.variance_m ? <span className="block text-[11px]">{r.variance_m > 0 ? '+' : ''}{fmt(r.variance_m)} {r.uom}</span> : null}</td>
                                <td className="px-3 py-2 text-right tabular-nums">{r.end_bit_m ? fmt(r.end_bit_m) : '—'}{r.end_bits?.length > 0 && <span className="block">{r.end_bits.map(e => ebChip(e, r.uom))}</span>}</td>
                                <td className="px-3 py-2 text-right tabular-nums">{r.short_m ? fmt(r.short_m) : '—'}</td>
                                <td className={`px-3 py-2 text-right tabular-nums ${r.unaccounted_m != null && r.unaccounted_m > Math.max(0.05, r.metres * 0.03) ? 'text-rose-700 font-bold' : ''}`}>{r.unaccounted_m != null ? <>{fmt(r.unaccounted_m)}{r.unaccounted_pct ? <span className="block text-[11px]">{r.unaccounted_pct} %</span> : null}</> : '—'}</td>
                                <td className="px-3 py-2 text-right whitespace-nowrap">
                                    {perms.cut && open && <button type="button" className="text-sm font-semibold text-indigo-700 hover:underline mr-2" onClick={() => { setFormError(''); setCut({ roll: r, lays: r.lays ? String(r.lays) : '', end: r.end_bit_m ? String(r.end_bit_m) : '', short: r.short_m ? String(r.short_m) : '', reason: '', endAuto: !r.end_bit_m }); }}><Scissors size={13} className="inline" /> {r.lays ? 'Re-cut' : 'Cut'}</button>}
                                    {perms.manage && open && !r.lays && <button type="button" className="p-1 text-rose-500" aria-label={`Remove roll ${r.roll_no}`} onClick={() => { if (window.confirm(`Remove roll ${r.roll_no} from the batch?`)) run(() => cuttingApi.removeRoll(id, r.id)); }}><Trash2 size={14} /></button>}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                    {b.rolls.length > 1 && (() => {   // totals row (20 Oct 2026) — the batch totals; units when the rolls share one
                        const u = b.totals.uom || '';
                        const lays = b.rolls.reduce((s, r) => s + (r.lays || 0), 0);
                        return (
                            <tfoot className={`${TONE.indigo.foot} border-t-2 font-bold`}>
                                <tr>
                                    <td className="px-3 py-2" colSpan={3}>Total · {b.totals.rolls_cut} of {b.totals.rolls} rolls cut</td>
                                    <td className="px-3 py-2 text-right tabular-nums">{fmt(b.totals.metres)} {u}</td>
                                    <td className="px-3 py-2 text-right tabular-nums">{lays || '—'}</td>
                                    <td className="px-3 py-2 text-right tabular-nums">{b.totals.garments || '—'}</td>
                                    <td className="px-3 py-2 text-right tabular-nums">{fmt(b.totals.expected_m)}</td>
                                    <td className="px-3 py-2 text-right tabular-nums">{fmt(b.totals.consumed_m)}</td>
                                    <td className="px-3 py-2 text-right tabular-nums">{fmt(b.totals.end_bits_m)}</td>
                                    <td className="px-3 py-2 text-right tabular-nums">{b.totals.short_m ? fmt(b.totals.short_m) : '—'}</td>
                                    <td className={`px-3 py-2 text-right tabular-nums ${b.totals.unaccounted_m > Math.max(0.05, b.totals.metres * 0.03) ? 'text-rose-700' : ''}`}>{fmt(b.totals.unaccounted_m)}</td>
                                    <td className="px-3 py-2" />
                                </tr>
                            </tfoot>
                        );
                    })()}
                </table>
            </div>
            </Section>
            <OverCutPanel oc={b.over_cut} batchId={b.id} canDecide={perms.over_cut} onDecided={() => load()} />
            <PocketsPanel b={b} canManage={perms.manage} onChanged={() => load()} />
            {b.grid.warnings.length > 0 && !(b.over_cut && (!b.over_cut.preview || b.over_cut.free + b.over_cut.approval > 0)) && <div className="mb-3 text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2"><p className="font-bold flex items-center gap-1.5"><AlertTriangle size={15} /> Over-cut against the order</p><ul className="list-disc pl-5 text-xs">{b.grid.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul></div>}
            {/* Full width, one above the other (20 Oct 2026): with 7+ sizes and a Total column side by side was too cramped. */}
            <Section tone="emerald" title={`Order ${b.line.order_no} line ${b.line.line_no} — all batches`} subtitle="Garments cut / planned · tap a colour for the breakdown">
                <OrderGrid grid={b.grid} mine={batchGarments(b)} tone="emerald" bare />
            </Section>
            <Section tone="amber" title={`#${b.floor_no} — pieces cut on this batch`} subtitle={b.batch_code}>
                <BatchPieces rows={b.piece_summary} sizeOrder={b.grid.sizes.map(s => s.name)} />
            </Section>
            <Section tone="slate" title="History">
            <div className="px-4 py-3">
                {b.history.map(h => <div key={h.id} className="py-1 text-sm"><span className="text-xs text-slate-400 mr-2">{new Date(h.created_at).toLocaleString()}</span><b>{ACTION[h.action] || h.action}</b>{h.user_name ? ` · ${h.user_name}` : ''}{h.reason ? <span className="text-slate-500"> — {h.reason}</span> : null}
                    {h.detail?.summary?.length > 0 && <ul className="ml-6 list-disc text-xs text-slate-600">{h.detail.summary.map((x, i) => <li key={i}>{x}</li>)}</ul>}</div>)}
            </div>
            </Section>

            {prio && (
                <Modal title={`Priority — ${b.batch_code}`} onClose={() => setPrio(null)}>
                    <div className="space-y-3 w-[min(400px,85vw)]">
                        <p className="text-sm text-slate-600">Line loading, the stage check queue and WIP ageing list higher priority batches first, then by ship date.</p>
                        <Field label="Priority"><select className={inputCls} value={prio.priority} onChange={e => setPrio({ ...prio, priority: e.target.value })}>{[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{PRIORITY[n][0]}</option>)}</select></Field>
                        <Field label="Why (optional)"><input className={inputCls} value={prio.note} onChange={e => setPrio({ ...prio, note: e.target.value })} placeholder="e.g. buyer moved the ship date forward" /></Field>
                        <ErrorBox text={formError} />
                        <div className="flex justify-end gap-2">
                            <SecondaryButton onClick={() => setPrio(null)}>Back</SecondaryButton>
                            <PrimaryButton busy={busy} disabled={busy} onClick={() => run(() => cuttingApi.setPriority(id, Number(prio.priority), prio.note || undefined), () => setPrio(null))}>Save</PrimaryButton>
                        </div>
                    </div>
                </Modal>
            )}
            {cut && (() => {
                const cutLay = perLay(b.layer_length_in, cut.roll.uom);
                // Suggested end bit (20 Oct 2026): what the lays leave of the roll — taken − lays × layer − short, ≥ 0.
                // Fills the End bit box while it hasn't been typed in (endAuto); typing stops it, "Use" puts it back.
                const suggestEnd = (lays, short) => (cutLay && Number(lays) > 0
                    ? Math.max(0, Math.round((cut.roll.metres - Number(lays) * cutLay - (Number(short) || 0)) * 100) / 100) : null);
                const withSuggestion = (next) => {
                    if (!next.endAuto) return next;
                    const s = suggestEnd(next.lays, next.short);
                    return { ...next, end: s == null ? '' : String(s) };
                };
                const suggested = suggestEnd(cut.lays, cut.short);
                const overRoll = cutLay && Number(cut.lays) > 0 && Number(cut.lays) * cutLay + (Number(cut.short) || 0) > cut.roll.metres + 0.005;
                return (
                <Modal title={`${cut.roll.lays ? 'Re-cut' : 'Cut'} roll ${cut.roll.floor_roll_no} (tag ${cut.roll.roll_no})`} onClose={() => setCut(null)}>
                    <div className="space-y-3 w-[min(460px,88vw)]">
                        <p className="text-sm text-slate-600">{fmt(cut.roll.metres)} {cut.roll.uom}{cutLay ? <> · layer {fmt(cutLay, 2)} {cut.roll.uom} → up to {Math.floor((cut.roll.metres - (cut.endAuto ? 0 : Number(cut.end) || 0) - (Number(cut.short) || 0)) / cutLay + 0.001)} lays</> : ' · weighed fabric: no lay-length check'}. Parts: {cut.roll.parts.map(p => p.part_name).join(', ')}.</p>
                        <div className="grid grid-cols-3 gap-3">
                            <Field label="Lays made *" hint={Number(cut.lays) > 0 ? `${Number(cut.lays) * b.ratio_sum} garments${cutLay ? ` · ${fmt(Number(cut.lays) * cutLay, 2)} ${cut.roll.uom}` : ''}` : ' '}><input className={inputCls} type="number" min="1" step="1" value={cut.lays} onChange={e => setCut(withSuggestion({ ...cut, lays: e.target.value }))} autoFocus /></Field>
                            <Field label={`End bit (${cut.roll.uom})`} hint={<>
                                {suggested != null && (cut.endAuto
                                    ? <span className="block font-semibold text-indigo-700">Suggested from the lays</span>
                                    : Math.abs((Number(cut.end) || 0) - suggested) > 0.005 && <span className="block font-semibold text-slate-600">Suggested {fmt(suggested, 2)} {cut.roll.uom} · <button type="button" className="text-indigo-700 hover:underline" onClick={() => setCut({ ...cut, end: String(suggested), endAuto: true })}>Use</button></span>)}
                                {cut.roll.end_bit_id ? 'Left of the lay piece: a new lay piece (under 0.3 m written off)' : 'Torn into a replacement reserve + a lay piece, tagged'}
                            </>}><input className={inputCls} type="number" min="0" step="any" value={cut.end} onChange={e => setCut({ ...cut, end: e.target.value, endAuto: e.target.value === '' })} /></Field>
                            <Field label={`Short (${cut.roll.uom})`} hint="Roll had less than its label"><input className={inputCls} type="number" min="0" step="any" value={cut.short} onChange={e => setCut(withSuggestion({ ...cut, short: e.target.value }))} /></Field>
                        </div>
                        {overRoll && <p className="text-xs font-semibold text-rose-800 bg-rose-50 border border-rose-200 rounded-lg px-2.5 py-1.5">{cut.lays} lays need {fmt(Number(cut.lays) * cutLay, 2)} {cut.roll.uom}{Number(cut.short) > 0 ? ` + ${fmt(Number(cut.short), 2)} short` : ''} — more than the {fmt(cut.roll.metres)} {cut.roll.uom} roll. Check the lays.</p>}
                        {(() => {   // what is left unaccounted with these numbers (warned above 3 %, never blocked)
                            if (!cutLay || !(Number(cut.lays) > 0)) return null;
                            const un = cut.roll.metres - Number(cut.lays) * cutLay - (Number(cut.end) || 0) - (Number(cut.short) || 0);
                            return un > Math.max(0.05, cut.roll.metres * 0.03)
                                ? <p className="text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">{fmt(un, 2)} {cut.roll.uom} not accounted for ({fmt((un / cut.roll.metres) * 100, 1)} % of the roll) — enter the end bit left on the roll, or what the roll was short.</p>
                                : null;
                        })()}
                        {cut.roll.lays && <Field label="Reason for correcting *"><input className={inputCls} value={cut.reason} onChange={e => setCut({ ...cut, reason: e.target.value })} /></Field>}
                        <ErrorBox text={formError} />
                        <div className="flex justify-end gap-2">
                            <SecondaryButton onClick={() => setCut(null)}>Back</SecondaryButton>
                            <PrimaryButton onClick={() => run(() => cuttingApi.cutRoll(id, cut.roll.id, { lays: Number(cut.lays), end_bit_m: cut.end === '' ? undefined : Number(cut.end), short_m: cut.short === '' ? undefined : Number(cut.short), reason: cut.reason || undefined }), () => setCut(null))}
                                busy={busy} disabled={busy || !(Number(cut.lays) > 0) || (cut.roll.lays && !cut.reason.trim())}>Save</PrimaryButton>
                        </div>
                    </div>
                </Modal>
            ); })()}
            {edit && (
                <Modal title="Ratio, layer length, numbering" onClose={() => setEdit(null)}>
                    <div className="space-y-3 w-[min(480px,88vw)]">
                        <div className="grid grid-cols-2 gap-3">
                            <Field label="Layer length (in)"><input className={inputCls} type="number" min="1" step="0.01" value={edit.layer_length_in} onChange={e => setEdit({ ...edit, layer_length_in: e.target.value })} /></Field>
                            <Field label="Numbering"><select className={inputCls} value={edit.numbering_mode} onChange={e => setEdit({ ...edit, numbering_mode: e.target.value })}><option value="MODE_1">Mode 1 — per roll</option><option value="MODE_2">Mode 2 — continuous</option></select></Field>
                        </div>
                        <div className="flex flex-wrap gap-2">{b.grid.sizes.map(s => <label key={s.id} className="text-center text-sm"><span className="block text-xs font-bold">{s.name}</span><input className={`${inputCls} !w-16 text-center`} type="number" min="0" value={edit.ratio[s.id] || ''} onChange={e => setEdit({ ...edit, ratio: { ...edit.ratio, [s.id]: e.target.value } })} aria-label={`Ratio ${s.name}`} /></label>)}</div>
                        <ErrorBox text={formError} />
                        <div className="flex justify-end gap-2"><SecondaryButton onClick={() => setEdit(null)}>Back</SecondaryButton>
                            <PrimaryButton onClick={() => run(() => cuttingApi.update(id, { layer_length_in: Number(edit.layer_length_in), numbering_mode: edit.numbering_mode, ratios: Object.entries(edit.ratio).filter(([, v]) => Number(v) > 0).map(([size_id, v]) => ({ size_id, ratio: Number(v) })) }), () => setEdit(null))} busy={busy} disabled={busy}>Save</PrimaryButton></div>
                    </div>
                </Modal>
            )}
            {add && (
                <Modal title="Add rolls issued to cutting" onClose={() => setAdd(null)}>
                    <div className="space-y-3 w-[min(620px,92vw)] max-h-[70vh] overflow-y-auto">
                        {add.rolls.length === 0 && add.ends.length === 0 ? <p className="text-sm text-slate-500">No issued fabric with anything free. Issue more fabric to cutting first.</p> : add.rolls.map(r => {
                            const p = add.picks[r.id];
                            return (
                                <div key={r.id} className="flex flex-wrap items-center gap-2 text-sm border-b border-slate-100 py-1">
                                    <input type="checkbox" checked={Boolean(p)} onChange={e => setAdd({ ...add, picks: e.target.checked ? { ...add.picks, [r.id]: { colour: r.colours.length === 1 ? r.colours[0].id : '' } } : Object.fromEntries(Object.entries(add.picks).filter(([k]) => k !== r.id)) })} aria-label={`Add ${r.roll_no}`} />
                                    <span className="w-56"><b>{r.roll_no}</b> {r.dye_lot ? `lot ${r.dye_lot} · ` : ''}{fmt(r.available)} {r.uom}<span className="block text-xs text-slate-500">{r.fabric_label}</span></span>
                                    {p && r.colours.length > 1 && <select className={`${inputCls} !w-40 !py-1`} value={p.colour} onChange={e => setAdd({ ...add, picks: { ...add.picks, [r.id]: { colour: e.target.value } } })} aria-label="Colour"><option value="">Colour…</option>{r.colours.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>}
                                </div>
                            );
                        })}
                        {add.ends.length > 0 && <p className="pt-1 text-xs font-black uppercase tracking-wider text-amber-800">End bits of this order — lay pieces (used whole)</p>}
                        {add.ends.map(e => (
                            <label key={e.id} className="flex flex-wrap items-center gap-2 text-sm border-b border-slate-100 py-1">
                                <input type="checkbox" checked={add.ebPicks.includes(e.id)} onChange={ev => setAdd({ ...add, ebPicks: ev.target.checked ? [...add.ebPicks, e.id] : add.ebPicks.filter(x => x !== e.id) })} aria-label={`Add end bit ${e.tag}`} />
                                <span className="w-56"><b>{e.tag}</b> {fmt(e.metres)} {e.uom} · {e.colour}<span className="block text-xs text-slate-500">{e.fabric_label}{perLay(b.layer_length_in, e.uom) ? ` · ${Math.floor(e.metres / perLay(b.layer_length_in, e.uom) + 1e-9)} lays at this layer` : ''}</span></span>
                            </label>
                        ))}
                        <ErrorBox text={formError} />
                        <div className="flex justify-end gap-2"><SecondaryButton onClick={() => setAdd(null)}>Back</SecondaryButton>
                            <PrimaryButton onClick={() => run(() => cuttingApi.addRolls(id, [...Object.entries(add.picks).map(([fabric_roll_id, p]) => ({ fabric_roll_id, garment_colour_id: p.colour || undefined })), ...add.ebPicks.map(end_bit_id => ({ end_bit_id }))]), () => setAdd(null))} busy={busy} disabled={busy || !(Object.keys(add.picks).length || add.ebPicks.length)}>Add</PrimaryButton></div>
                    </div>
                </Modal>
            )}
            {fin && (() => {
                const lines = fin.pockets || [];
                const pocketShort = lines.map(x => ({ ...x, after: Math.max(0, x.short - x.stock_left) })).filter(x => x.after > 0);
                const needOc = b.over_cut?.approval > 0;
                const ok = fin.pockets !== null && !pocketShort.length && (!lines.length || fin.put) && (!needOc || fin.reason.trim());
                return (
                    <Modal title={`Finalise ${b.batch_code}`} onClose={() => setFin(null)}>
                        <div className="space-y-3 w-[min(960px,88vw)] max-h-[85vh] overflow-y-auto">
                            <p className="text-sm text-slate-700">The pieces go to the numbering check and the batch can't be cut any more (until Undo finalise).</p>
                            {b.fabric_warnings?.length > 0 && <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"><p className="font-bold">Fabric not accounted for</p>{b.fabric_warnings.map(w => <p key={w} className="text-xs">{w}</p>)}</div>}
                            {b.over_cut?.free > 0 && !needOc && <p className="text-sm text-slate-700">Over-cut: {b.over_cut.free} garment(s) within {b.over_cut.pct} % — their trims come from free stock.</p>}
                            {needOc && (<>
                                <p className="text-sm text-slate-700"><b className="text-rose-700">{b.over_cut.approval}</b> garment(s) are cut above the order beyond the free {b.over_cut.pct} %. Say why; the merchandiser then approves their trims (from free stock) or refuses — refused garments are written off.</p>
                                <OverCutCells cells={b.over_cut.cells} />
                                <Field label="Over-cut reason *"><textarea className={inputCls} rows={2} value={fin.reason} onChange={e => setFin({ ...fin, reason: e.target.value })} /></Field>
                            </>)}
                            {fin.pockets === null ? <Loading /> : lines.length > 0 && (
                                <div className={`rounded-lg border px-3 py-2 ${pocketShort.length ? 'border-rose-300 bg-rose-50' : 'border-indigo-200 bg-indigo-50/50'}`}>
                                    <p className="font-black text-slate-800 mb-1">Pockets & lining go with this batch</p>
                                    {(() => {
                                        // Same layout as "Pockets & lining with this batch" (owner's drawing): part × size rows (part merged),
                                        // one column group per pocketing / lining fabric; Total row per fabric.
                                        const fabrics = [...new Map(lines.map(x => [x.fabric_item_id, { id: x.fabric_item_id, label: x.fabric }])).values()];
                                        const parts = [...new Map(lines.map(x => [x.part_id, { id: x.part_id, name: x.part_name, per: x.per_garment }])).values()];
                                        const cell = new Map(lines.map(x => [`${x.fabric_item_id}|${x.part_id}|${x.size_id}`, x]));
                                        const sizesOf = (pid) => [...new Map(lines.filter(x => x.part_id === pid).sort((p1, p2) => p1.size_order - p2.size_order).map(x => [x.size_id, { id: x.size_id, name: x.size }])).values()];
                                        const cols = ['Garments', 'To hand over', 'Order stock', 'Short'];
                                        const th = 'px-2 py-1.5 border border-slate-200';
                                        const td = 'px-2 py-1.5 border border-slate-200 text-right tabular-nums';
                                        const tot = (fid, fn) => lines.filter(x => x.fabric_item_id === fid).reduce((a2, x) => a2 + fn(x), 0);
                                        const shortOf = (x) => Math.max(0, x.short - x.stock_left);
                                        return (
                                            <div className="overflow-x-auto">
                                                <table className="w-full text-sm border-collapse bg-white">
                                                    <thead className="text-xs font-bold text-slate-600 uppercase">
                                                        <tr>
                                                            <th rowSpan={2} className={`${th} text-left`}>Part</th><th rowSpan={2} className={`${th} text-left`}>Size</th>
                                                            {fabrics.map(f => <th key={f.id} colSpan={cols.length} className={`${th} text-center normal-case text-sm text-slate-800`}>{f.label}</th>)}
                                                        </tr>
                                                        <tr>{fabrics.map(f => cols.map((c, i) => <th key={`${f.id}|${i}`} className={`${th} text-right whitespace-nowrap`}>{c}</th>))}</tr>
                                                    </thead>
                                                    <tbody>{parts.map(pt => sizesOf(pt.id).map((sz, i, arr) => (
                                                        <tr key={`${pt.id}|${sz.id}`}>
                                                            {i === 0 && <td rowSpan={arr.length} className={`${td} text-left align-middle font-semibold whitespace-nowrap`}>{pt.name}<span className="block text-xs font-normal text-slate-500">{pt.per || 1} per garment</span></td>}
                                                            <td className={`${td} font-bold`}>{sz.name}</td>
                                                            {fabrics.map(f => {
                                                                const x = cell.get(`${f.id}|${pt.id}|${sz.id}`);
                                                                if (!x) return cols.map((c, j) => <td key={`${f.id}|${j}`} className={td} />);
                                                                const sh = shortOf(x);
                                                                return [
                                                                    <td key="g" className={td}>{fmt(x.garments)}</td>,
                                                                    <td key="h" className={`${td} font-bold`}>{fmt(x.short)}</td>,
                                                                    <td key="o" className={td}>{fmt(x.stock_left)}</td>,
                                                                    <td key="s" className={`${td} ${sh ? 'text-rose-700 font-black bg-rose-50' : 'text-emerald-700'}`}>{sh ? fmt(sh) : '✓'}</td>,
                                                                ];
                                                            })}
                                                        </tr>
                                                    )))}</tbody>
                                                    <tfoot><tr className="font-black bg-slate-50">
                                                        <td colSpan={2} className={`${td} text-left`}>Total</td>
                                                        {fabrics.map(f => [
                                                            <td key={`${f.id}g`} className={td}>{fmt(tot(f.id, x => x.garments))}</td>,
                                                            <td key={`${f.id}h`} className={td}>{fmt(tot(f.id, x => x.short))}</td>,
                                                            <td key={`${f.id}o`} className={td}>{fmt(tot(f.id, x => x.stock_left))}</td>,
                                                            <td key={`${f.id}s`} className={`${td} ${tot(f.id, shortOf) ? 'text-rose-700' : 'text-emerald-700'}`}>{tot(f.id, shortOf) ? fmt(tot(f.id, shortOf)) : '✓'}</td>,
                                                        ])}
                                                    </tr></tfoot>
                                                </table>
                                            </div>
                                        );
                                    })()}
                                    {pocketShort.length > 0 ? (
                                        <p className="mt-2 text-sm text-rose-800"><b>Can't finalise yet:</b> the order's pocket stock is short for this batch. Cut a pocketing / lining lay first, then finalise. <Link to={`/v3/cutting/pocketing?order=${b.order_id}`} className="font-bold text-indigo-700 hover:underline">Pocketing & lining →</Link></p>
                                    ) : (
                                        <label className="mt-2 flex items-start gap-2 text-sm font-semibold text-slate-800"><input type="checkbox" className="w-4 h-4 mt-0.5" checked={fin.put} onChange={e => setFin({ ...fin, put: e.target.checked })} />
                                            I have counted these pockets / lining pieces and put them with the batch — they are handed over from the order's stock when it is finalised.</label>
                                    )}
                                </div>
                            )}
                            <ErrorBox text={formError} />
                            <div className="flex justify-end gap-2"><SecondaryButton onClick={() => setFin(null)}>Back</SecondaryButton>
                                <PrimaryButton onClick={() => run(() => cuttingApi.finalize(id, { ...(needOc ? { over_cut_reason: fin.reason.trim() } : {}), ...(lines.length ? { hand_pockets: true } : {}) }), () => setFin(null))} busy={busy} disabled={busy || !ok}>
                                    <CheckCircle2 size={14} /> {lines.length ? 'Hand over pockets and finalise' : 'Finalise cutting'}</PrimaryButton></div>
                        </div>
                    </Modal>
                );
            })()}
            {undo && (
                <Modal title={`Undo finalise — ${b.batch_code}`} onClose={() => setUndo(null)}>
                    <div className="space-y-3 w-[min(560px,92vw)]">
                        {undo.plan.allowed ? (<>
                            <p className="text-sm text-slate-700">The batch goes back to <b>cutting</b>: rolls can be re-cut, added or removed, then finalised again. Rolls, lays, pieces and end bits stay.</p>
                            <ul className="text-sm text-slate-700 list-disc pl-5 space-y-0.5">
                                <li>Numbering setup removed: {undo.plan.removes.bundles} bundle(s), {undo.plan.removes.garments} garment record(s) — made again at the next finalise</li>
                                {undo.plan.removes.kits.length > 0 && <li>Trim kit {undo.plan.removes.kits.join(', ')} cancelled — a new kit is made at the next finalise</li>}
                                {undo.plan.removes.pocket_moves > 0 && <li>Pockets / lining: {fmt(undo.plan.removes.pocket_pieces)} piece(s) handed with the batch go back to the order's stock — hand them over again</li>}
                                {undo.plan.removes.fabric_report_run && <li>The order's fabric reconciliation (run {undo.plan.removes.fabric_report_run}) is marked <b>outdated</b> — generate it again after finalising</li>}
                                {undo.plan.removes.over_cut && <li>Over-cut record ({undo.plan.removes.over_cut.toLowerCase()}) removed — worked out again at the next finalise</li>}
                            </ul>
                            <Field label="Reason *"><textarea className={inputCls} rows={2} value={undo.reason} onChange={e => setUndo({ ...undo, reason: e.target.value })} autoFocus /></Field>
                        </>) : (
                            <div className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-900">
                                <p className="font-bold">It can't go back to cutting — the batch has moved on:</p>
                                <ul className="list-disc pl-5">{undo.plan.blockers.map(x => <li key={x}>{x}</li>)}</ul>
                            </div>
                        )}
                        <ErrorBox text={formError} />
                        <div className="flex justify-end gap-2"><SecondaryButton onClick={() => setUndo(null)}>Back</SecondaryButton>
                            {undo.plan.allowed && <PrimaryButton onClick={() => run(() => cuttingApi.unfinalize(id, undo.reason.trim()), () => setUndo(null))} busy={busy} disabled={busy || !undo.reason.trim()}><Undo2 size={14} /> Back to cutting</PrimaryButton>}</div>
                    </div>
                </Modal>
            )}
            {cancel !== null && (
                <Modal title={`Cancel ${b.batch_code}`} onClose={() => setCancel(null)}>
                    <div className="space-y-3 w-[min(420px,85vw)]">
                        <Field label="Reason *"><input className={inputCls} value={cancel} onChange={e => setCancel(e.target.value)} autoFocus /></Field>
                        <ErrorBox text={formError} />
                        <div className="flex justify-end gap-2"><SecondaryButton onClick={() => setCancel(null)}>Back</SecondaryButton><PrimaryButton onClick={() => run(() => cuttingApi.cancel(id, cancel.trim()), () => setCancel(null))} busy={busy} disabled={busy || !cancel.trim()}>Cancel batch</PrimaryButton></div>
                    </div>
                </Modal>
            )}
        </div>
    );
}

// One cut batch: ratio, layer length, numbering; rolls with lays, end bits,
// fabric check (expected vs used); cut / re-cut per roll (operator), pieces
// per colour × part × size with number ranges, the order grid with over-cut
// warnings, finalise (→ numbering check), cancel, history, cut sheet PDF.
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Scissors, CheckCircle2, Ban, Plus, Trash2, FileDown, Pencil, AlertTriangle } from 'lucide-react';
import Modal from '../../shared/Modal';
import { cuttingApi } from '../api/cuttingApi';
import { apiError } from '../api/mastersApi';
import { Field, inputCls, PrimaryButton, SecondaryButton, ErrorBox, Loading } from '../components/ui';
import { CUT_STATUS, OrderGrid, IN_TO_M, fmt, exportCutSheet, useCuttingPermissions } from './cutShared';

const ACTION = { CREATED: 'Created', EDITED: 'Edited', ROLL_ADDED: 'Roll added', ROLL_REMOVED: 'Roll removed', ROLL_CUT: 'Roll cut', ROLL_RECUT: 'Roll re-cut', END_BIT: 'End bit returned', FINALIZED: 'Finalised', CANCELLED: 'Cancelled' };

export default function CutBatchPage() {
    const { id } = useParams();
    const perms = useCuttingPermissions();
    const [b, setB] = useState(null);
    const [error, setError] = useState('');
    const [cut, setCut] = useState(null);       // { roll, lays, end, reason }
    const [edit, setEdit] = useState(null);
    const [add, setAdd] = useState(null);       // { rolls (available), picks }
    const [cancel, setCancel] = useState(null);
    const [formError, setFormError] = useState('');
    const [busy, setBusy] = useState(false);
    const load = useCallback(() => cuttingApi.batch(id).then(res => setB(res.data)).catch(err => setError(apiError(err, 'Failed to load the batch.'))), [id]);
    useEffect(() => { load(); }, [load]);
    if (!b) return <div>{error ? <ErrorBox text={error} /> : <Loading />}</div>;
    const open = ['DRAFT', 'CUTTING'].includes(b.status);
    const layM = b.layer_length_in * IN_TO_M;
    const run = async (fn, close) => {
        setBusy(true); setFormError(''); setError('');
        try { setB((await fn()).data); if (close) close(); } catch (err) { (close ? setFormError : setError)(apiError(err, 'Failed.')); } finally { setBusy(false); }
    };
    const openAdd = async () => {
        setFormError('');
        try { const res = await cuttingApi.orderLine(b.order_line_id); setAdd({ rolls: res.data.rolls.filter(r => r.available > 0), picks: {} }); } catch (err) { setError(apiError(err, 'Failed.')); }
    };
    return (
        <div>
            <Link to="/v3/cutting?tab=batches" className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-indigo-600 mb-3"><ArrowLeft size={15} /> Cut batches</Link>
            <div className="flex flex-wrap items-center gap-3 mb-1">
                <h1 className="text-2xl font-black text-slate-900">{b.batch_code}</h1>
                <span className={`text-[11px] font-black px-2 py-0.5 rounded border ${CUT_STATUS[b.status].cls}`}>{CUT_STATUS[b.status].label}</span>
            </div>
            <p className="text-sm text-slate-500 mb-1">{b.line.customer_name} · {b.line.style_code} {b.line.style_name} · {b.numbering_mode === 'MODE_2' ? 'numbering continuous across rolls (mode 2)' : 'numbering per roll (mode 1)'} · layer {b.layer_length_in} in ({fmt(layM, 2)} m) · ratio {b.ratios.map(r => `${r.size}:${r.ratio}`).join('  ')} ({b.ratio_sum}/lay)</p>
            {b.gate_override && <p className="text-sm text-rose-700 mb-1">Created under the factory admin's cutting-gate override.</p>}
            {b.status === 'CANCELLED' && <p className="text-sm text-slate-600 mb-1"><b>Cancelled:</b> {b.cancelled_reason}</p>}
            <div className="flex flex-wrap gap-2 my-3">
                {perms.manage && b.status === 'DRAFT' && <SecondaryButton onClick={() => { setFormError(''); setEdit({ layer_length_in: String(b.layer_length_in), numbering_mode: b.numbering_mode, ratio: Object.fromEntries(b.ratios.map(r => [r.size_id, String(r.ratio)])) }); }}><Pencil size={14} /> Ratio / length</SecondaryButton>}
                {perms.manage && open && <SecondaryButton onClick={openAdd}><Plus size={14} /> Add rolls</SecondaryButton>}
                {perms.manage && b.status === 'CUTTING' && <PrimaryButton onClick={() => { if (window.confirm(`Finalise ${b.batch_code}? The pieces go to the numbering check and the batch can't be cut any more.`)) run(() => cuttingApi.finalize(id)); }} busy={busy} disabled={busy}><CheckCircle2 size={14} /> Finalise cutting</PrimaryButton>}
                {perms.manage && b.status === 'DRAFT' && <SecondaryButton onClick={() => { setFormError(''); setCancel(''); }}><Ban size={14} /> Cancel batch</SecondaryButton>}
                <span className="ml-auto"><SecondaryButton onClick={() => exportCutSheet(b)}><FileDown size={14} /> Cut sheet</SecondaryButton></span>
            </div>
            <ErrorBox text={error} />
            {b.stages?.length > 0 && (
                <div className="mb-3 flex flex-wrap gap-2 text-xs">{b.stages.map(x => (
                    <span key={x.sequence_no} className={`px-2 py-1 rounded border ${x.status === 'COMPLETED' ? 'bg-emerald-50 border-emerald-300 text-emerald-800' : x.status === 'IN_PROGRESS' ? 'bg-amber-50 border-amber-300 text-amber-800' : 'bg-white border-slate-200 text-slate-500'}`}>
                        {x.sequence_no}. {x.name === 'Cutting' ? 'Numbering check' : x.name}: {x.status.toLowerCase().replace('_', ' ')}{x.line ? ` · ${x.line}` : ''}</span>
                ))}{b.recuts?.open > 0 && <span className="px-2 py-1 rounded border bg-rose-50 border-rose-300 text-rose-800">{b.recuts.open} re-cut(s) open</span>}</div>
            )}
            <div className="grid sm:grid-cols-4 gap-3 mb-4">
                {[['Rolls cut', `${b.totals.rolls_cut} / ${b.totals.rolls}`], ['Garments', b.totals.garments], ['Pieces', b.totals.pieces], ['Fabric', `${fmt(b.totals.consumed_m)} m used · ${fmt(b.totals.expected_m)} m expected`]].map(([k, v]) => (
                    <div key={k} className="bg-white border border-slate-200 rounded-xl p-3"><p className="text-xs font-bold text-slate-500">{k}</p><p className="font-black text-slate-800">{v}</p></div>
                ))}
            </div>
            <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto mb-4">
                <table className="w-full text-sm min-w-[980px]">
                    <thead className="bg-slate-50 text-left text-xs font-bold text-slate-500 uppercase tracking-wider"><tr><th className="px-3 py-2">#</th><th className="px-3 py-2">Roll</th><th className="px-3 py-2">Colour → parts</th><th className="px-3 py-2 text-right">Metres</th><th className="px-3 py-2 text-right">Lays</th><th className="px-3 py-2 text-right">Expected</th><th className="px-3 py-2 text-right">Used</th><th className="px-3 py-2 text-right">End bit</th><th className="px-3 py-2 text-right">Pieces</th><th className="px-3 py-2" /></tr></thead>
                    <tbody>
                        {b.rolls.map(r => (
                            <tr key={r.id} className="border-t border-slate-100">
                                <td className="px-3 py-2">{r.roll_sequence}</td>
                                <td className="px-3 py-2 font-semibold">{r.roll_no}<span className="block text-xs font-normal text-slate-500">{r.dye_lot ? `lot ${r.dye_lot} · ` : ''}{r.fabric_label}</span></td>
                                <td className="px-3 py-2 text-xs">{r.colour}<span className="block text-slate-500">{r.parts.map(p => p.part_name).join(', ')}</span></td>
                                <td className="px-3 py-2 text-right tabular-nums">{fmt(r.metres)}</td>
                                <td className="px-3 py-2 text-right tabular-nums font-bold">{r.lays ?? '—'}</td>
                                <td className="px-3 py-2 text-right tabular-nums">{r.expected_m != null ? fmt(r.expected_m) : '—'}</td>
                                <td className={`px-3 py-2 text-right tabular-nums ${r.variance_m != null && Math.abs(r.variance_m) > r.metres * 0.03 ? 'text-amber-700 font-bold' : ''}`}>{r.consumed_m != null ? fmt(r.consumed_m) : '—'}{r.variance_m ? <span className="block text-[11px]">{r.variance_m > 0 ? '+' : ''}{fmt(r.variance_m)} m</span> : null}</td>
                                <td className="px-3 py-2 text-right tabular-nums">{r.end_bit_m ? fmt(r.end_bit_m) : '—'}</td>
                                <td className="px-3 py-2 text-right tabular-nums">{r.pieces || '—'}</td>
                                <td className="px-3 py-2 text-right whitespace-nowrap">
                                    {perms.cut && open && <button type="button" className="text-sm font-semibold text-indigo-700 hover:underline mr-2" onClick={() => { setFormError(''); setCut({ roll: r, lays: r.lays ? String(r.lays) : '', end: r.end_bit_m ? String(r.end_bit_m) : '', reason: '' }); }}><Scissors size={13} className="inline" /> {r.lays ? 'Re-cut' : 'Cut'}</button>}
                                    {perms.manage && open && !r.lays && <button type="button" className="p-1 text-rose-500" aria-label={`Remove roll ${r.roll_no}`} onClick={() => { if (window.confirm(`Remove roll ${r.roll_no} from the batch?`)) run(() => cuttingApi.removeRoll(id, r.id)); }}><Trash2 size={14} /></button>}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {b.grid.warnings.length > 0 && <div className="mb-3 text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2"><p className="font-bold flex items-center gap-1.5"><AlertTriangle size={15} /> Over-cut against the order</p><ul className="list-disc pl-5 text-xs">{b.grid.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul></div>}
            <div className="grid lg:grid-cols-2 gap-4 mb-4">
                <div><p className="text-xs font-black uppercase tracking-wider text-slate-500 mb-2">Order {b.line.order_no} line {b.line.line_no} — all batches</p><OrderGrid grid={b.grid} /></div>
                <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50 text-left text-xs font-bold text-slate-500 uppercase tracking-wider"><tr><th className="px-3 py-2">Colour</th><th className="px-3 py-2">Part</th><th className="px-3 py-2">Size</th><th className="px-3 py-2 text-right">Pieces</th><th className="px-3 py-2">Numbers</th></tr></thead>
                        <tbody>
                            {b.piece_summary.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400">Nothing cut yet.</td></tr>}
                            {b.piece_summary.map((p, i) => <tr key={i} className="border-t border-slate-100"><td className="px-3 py-1.5">{p.colour}</td><td className="px-3 py-1.5">{p.part_name}{p.part_type === 'SUPPORTING' && <span className="text-xs text-slate-400"> (supporting)</span>}</td><td className="px-3 py-1.5">{p.size}</td><td className="px-3 py-1.5 text-right tabular-nums">{p.pieces}</td><td className="px-3 py-1.5 text-xs tabular-nums">{p.first_no}–{p.last_no}</td></tr>)}
                        </tbody>
                    </table>
                </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
                <p className="text-xs font-black uppercase tracking-wider text-slate-500 mb-2">History</p>
                {b.history.map(h => <div key={h.id} className="py-1 text-sm"><span className="text-xs text-slate-400 mr-2">{new Date(h.created_at).toLocaleString()}</span><b>{ACTION[h.action] || h.action}</b>{h.user_name ? ` · ${h.user_name}` : ''}{h.reason ? <span className="text-slate-500"> — {h.reason}</span> : null}
                    {h.detail?.summary?.length > 0 && <ul className="ml-6 list-disc text-xs text-slate-600">{h.detail.summary.map((x, i) => <li key={i}>{x}</li>)}</ul>}</div>)}
            </div>

            {cut && (
                <Modal title={`${cut.roll.lays ? 'Re-cut' : 'Cut'} roll ${cut.roll.roll_no}`} onClose={() => setCut(null)}>
                    <div className="space-y-3 w-[min(460px,88vw)]">
                        <p className="text-sm text-slate-600">{fmt(cut.roll.metres)} m · layer {fmt(layM, 2)} m → up to {Math.floor((cut.roll.metres - (Number(cut.end) || 0)) / layM + 1e-9)} lays. Parts: {cut.roll.parts.map(p => p.part_name).join(', ')}.</p>
                        <div className="grid grid-cols-2 gap-3">
                            <Field label="Lays made *" hint={Number(cut.lays) > 0 ? `${Number(cut.lays) * b.ratio_sum} garments · ${fmt(Number(cut.lays) * layM, 2)} m` : ' '}><input className={inputCls} type="number" min="1" step="1" value={cut.lays} onChange={e => setCut({ ...cut, lays: e.target.value })} autoFocus /></Field>
                            <Field label="End bit (m)" hint={cut.roll.end_bit_m ? `${cut.roll.end_bit_m} m already returned` : 'Goes back to the roll'}><input className={inputCls} type="number" min={cut.roll.end_bit_m || 0} step="any" value={cut.end} onChange={e => setCut({ ...cut, end: e.target.value })} /></Field>
                        </div>
                        {cut.roll.lays && <Field label="Reason for correcting *"><input className={inputCls} value={cut.reason} onChange={e => setCut({ ...cut, reason: e.target.value })} /></Field>}
                        <ErrorBox text={formError} />
                        <div className="flex justify-end gap-2">
                            <SecondaryButton onClick={() => setCut(null)}>Back</SecondaryButton>
                            <PrimaryButton onClick={() => run(() => cuttingApi.cutRoll(id, cut.roll.id, { lays: Number(cut.lays), end_bit_m: cut.end === '' ? undefined : Number(cut.end), reason: cut.reason || undefined }), () => setCut(null))}
                                busy={busy} disabled={busy || !(Number(cut.lays) > 0) || (cut.roll.lays && !cut.reason.trim())}>Save</PrimaryButton>
                        </div>
                    </div>
                </Modal>
            )}
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
                        {add.rolls.length === 0 ? <p className="text-sm text-slate-500">No issued fabric with metres free. Issue more fabric to cutting first.</p> : add.rolls.map(r => {
                            const p = add.picks[r.id];
                            return (
                                <div key={r.id} className="flex flex-wrap items-center gap-2 text-sm border-b border-slate-100 py-1">
                                    <input type="checkbox" checked={Boolean(p)} onChange={e => setAdd({ ...add, picks: e.target.checked ? { ...add.picks, [r.id]: { colour: r.colours.length === 1 ? r.colours[0].id : '' } } : Object.fromEntries(Object.entries(add.picks).filter(([k]) => k !== r.id)) })} aria-label={`Add ${r.roll_no}`} />
                                    <span className="w-56"><b>{r.roll_no}</b> {r.dye_lot ? `lot ${r.dye_lot} · ` : ''}{fmt(r.available)} m<span className="block text-xs text-slate-500">{r.fabric_label}</span></span>
                                    {p && r.colours.length > 1 && <select className={`${inputCls} !w-40 !py-1`} value={p.colour} onChange={e => setAdd({ ...add, picks: { ...add.picks, [r.id]: { colour: e.target.value } } })} aria-label="Colour"><option value="">Colour…</option>{r.colours.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>}
                                </div>
                            );
                        })}
                        <ErrorBox text={formError} />
                        <div className="flex justify-end gap-2"><SecondaryButton onClick={() => setAdd(null)}>Back</SecondaryButton>
                            <PrimaryButton onClick={() => run(() => cuttingApi.addRolls(id, Object.entries(add.picks).map(([fabric_roll_id, p]) => ({ fabric_roll_id, garment_colour_id: p.colour || undefined }))), () => setAdd(null))} busy={busy} disabled={busy || !Object.keys(add.picks).length}>Add</PrimaryButton></div>
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

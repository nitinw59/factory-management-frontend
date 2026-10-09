// Rework & rejected at one stage of a batch (Production Workflow → batch → stage chip).
// Every piece (piece stages: numbering, preparatory, sewing) or garment (garment stages: assembly …)
// sent to rework or rejected at this stage, shown visually — one chip per piece, grouped by roll →
// size → part, coloured by where it stands — with the full defect history and material replacement
// requests. Managers (factory admin, production / cutting / quality manager) can tick pieces in open
// rework — or rejected, here or at an earlier stage (e.g. rejected at cutting, asked for at BF sewing) — and send
// them for material replacement; the request goes to the stage that rejected the piece, where it is re-checked once
// the cutting manager fulfils it.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { productionManagerApi } from '../../api/productionManagerApi';
import { materialReplacementApi } from '../../api/materialReplacementApi';

const CAT = {
    REWORK:      { label: 'In rework',           chip: 'bg-amber-400 text-amber-950 border-amber-500',  dot: 'bg-amber-400' },
    REJECTED:    { label: 'Rejected',            chip: 'bg-red-500 text-white border-red-600',           dot: 'bg-red-500' },
    REJECTED_EARLIER: { label: 'Rejected at an earlier stage', chip: 'bg-white text-red-700 border-2 border-red-500', dot: 'bg-white border-2 border-red-500' },
    REPLACEMENT: { label: 'Replacement open',    chip: 'bg-violet-500 text-white border-violet-600',     dot: 'bg-violet-500' },
    REPLACED:    { label: 'Replaced',            chip: 'bg-teal-500 text-white border-teal-600',         dot: 'bg-teal-500' },
    REPAIRED:    { label: 'Repaired / cleared',  chip: 'bg-blue-100 text-blue-800 border-blue-300',      dot: 'bg-blue-300' },
    CLEARED:     { label: 'Rejected, then passed', chip: 'bg-slate-200 text-slate-700 border-slate-400', dot: 'bg-slate-400' },
};
const ORDER = ['REWORK', 'REJECTED', 'REJECTED_EARLIER', 'REPLACEMENT', 'REPLACED', 'REPAIRED', 'CLEARED'];
const when = (t) => (t ? new Date(t).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
const sev = (s) => (s === 'QC_REJECTED' ? 'Rejected' : s === 'NEEDS_REWORK' ? 'Rework' : s);

export default function StageDefectsPanel({ batchId, flowId, onChanged }) {
    const [data, setData] = useState(null);
    const [error, setError] = useState('');
    const [filter, setFilter] = useState('');
    const [picked, setPicked] = useState(new Set());
    const [focus, setFocus] = useState(null);
    const [notes, setNotes] = useState('');
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState('');
    const [actionError, setActionError] = useState('');

    const load = useCallback(() => {
        productionManagerApi.getBatchStageDefects(batchId, flowId)
            .then(res => setData(res.data))
            .catch(err => setError(err?.response?.data?.error || err.message || 'Failed to load'));
    }, [batchId, flowId]);
    useEffect(() => { load(); }, [load]);

    const items = useMemo(() => (data?.items || []).filter(i => !filter || i.category === filter), [data, filter]);
    // roll → size → part → pieces (garments: roll → size)
    const groups = useMemo(() => {
        const m = new Map();
        for (const i of items) {
            const k = `${i.roll_id}|${i.size}|${i.part || ''}`;
            if (!m.has(k)) m.set(k, { roll: i.roll_id, size: i.size, part: i.part || null, items: [] });
            m.get(k).items.push(i);
        }
        return [...m.values()];
    }, [items]);

    if (error) return <p className="text-red-500 text-xs">{error}</p>;
    if (!data) return <p className="text-slate-400 text-xs">Loading rework / rejected…</p>;
    const isPiece = data.unit === 'PIECE';
    const c = data.counts;
    const toggle = (i) => {
        if (!i.can_replace) { setFocus(i); return; }
        const s = new Set(picked);
        if (s.has(i.id)) s.delete(i.id); else s.add(i.id);
        setPicked(s); setFocus(i);
    };
    const send = async () => {
        setBusy(true); setMsg(''); setActionError('');
        try {
            const res = await materialReplacementApi.createFromBatch({ batchId, flowId, pieceIds: [...picked], notes });
            setMsg(res.data?.message || 'Sent for replacement.'); setPicked(new Set()); setNotes(''); load(); onChanged?.();
        } catch (err) { setActionError(err?.response?.data?.error || 'Failed.'); }
        finally { setBusy(false); }
    };

    if (!c.total) return (
        <div className="mb-4 p-3 rounded-xl border border-emerald-200 bg-emerald-50 text-xs text-emerald-800">
            No {isPiece ? 'piece' : 'garment'} has been sent to rework or rejected at this stage.
        </div>
    );

    return (
        <div className="mb-4 border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 mr-1">Rework &amp; rejected · {c.total} {isPiece ? 'piece(s)' : 'garment(s)'}</span>
                <button type="button" onClick={() => setFilter('')} className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${!filter ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-300'}`}>All</button>
                {ORDER.filter(k => c[k] > 0).map(k => (
                    <button key={k} type="button" onClick={() => setFilter(filter === k ? '' : k)}
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${filter === k ? 'ring-2 ring-offset-1 ring-slate-500' : ''} bg-white text-slate-700 border-slate-300`}>
                        <span className={`w-2.5 h-2.5 rounded-sm ${CAT[k].dot}`} />{CAT[k].label} {c[k]}
                    </button>
                ))}
            </div>

            {/* Visual: one chip per piece, grouped by roll → size → part */}
            <div className="p-3 max-h-[34vh] overflow-y-auto space-y-1.5">
                {groups.map(g => (
                    <div key={`${g.roll}|${g.size}|${g.part}`} className="flex items-start gap-2">
                        <div className="w-40 shrink-0 text-[10px] text-slate-500 pt-1 leading-tight">
                            <span className="font-mono font-bold text-slate-700">Roll {g.roll}</span> · {g.size}{g.part ? <span className="block uppercase font-bold text-slate-600">{g.part}</span> : null}
                        </div>
                        <div className="flex flex-wrap gap-1">
                            {g.items.map(i => (
                                <button key={i.id} type="button" onClick={() => toggle(i)}
                                    title={`${i.uid} — ${CAT[i.category].label}${i.rejected_earlier ? ` (at ${i.rejected_earlier})` : ''}${i.defects.length ? ` · ${i.defects[i.defects.length - 1].code} ${i.defects[i.defects.length - 1].description}` : ''}${i.can_replace ? ' · click to select for replacement' : ''}`}
                                    className={`min-w-[34px] h-7 px-1 rounded border text-[10px] font-black tabular-nums ${CAT[i.category].chip} ${picked.has(i.id) ? 'ring-2 ring-offset-1 ring-indigo-600' : ''} ${focus?.id === i.id ? 'outline outline-2 outline-slate-800' : ''}`}>
                                    {i.seq}
                                </button>
                            ))}
                        </div>
                    </div>
                ))}
            </div>

            {/* Replacement request (managers, pieces in open rework) */}
            {isPiece && data.can_request && (
                <div className="px-3 py-2 border-t border-slate-200 bg-violet-50 flex flex-wrap items-center gap-2">
                    <span className="text-[11px] font-bold text-violet-900">{picked.size ? `${picked.size} piece(s) selected` : 'Tick amber (rework) or red (rejected, here or earlier) pieces to send for material replacement'}</span>
                    {picked.size > 0 && <>
                        <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Note for the cutting manager (optional)" className="flex-1 min-w-[180px] px-2 py-1 text-xs border border-violet-200 rounded" />
                        <button type="button" disabled={busy} onClick={send} className="px-3 py-1 rounded bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold disabled:opacity-50">{busy ? 'Sending…' : 'Request material replacement'}</button>
                        <button type="button" onClick={() => setPicked(new Set())} className="text-[11px] text-violet-700 underline">clear</button>
                    </>}
                    {data.items.some(i => i.can_replace) && !picked.size && <button type="button" onClick={() => setPicked(new Set(data.items.filter(i => i.can_replace).map(i => i.id)))} className="ml-auto text-[11px] text-violet-700 underline">select all {data.items.filter(i => i.can_replace).length} (rework + rejected)</button>}
                </div>
            )}
            {msg && <p className="px-3 py-1.5 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border-t border-emerald-100">{msg}</p>}
            {actionError && <p className="px-3 py-1.5 text-[11px] font-semibold text-red-700 bg-red-50 border-t border-red-100">{actionError}</p>}

            {/* Detail of the focused piece */}
            {focus && (
                <div className="px-3 py-2 border-t border-slate-200 text-[11px] bg-white">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className={`px-1.5 py-0.5 rounded border font-bold ${CAT[focus.category].chip}`}>{CAT[focus.category].label}</span>
                        <span className="font-mono font-bold text-slate-800">{focus.uid}</span>
                        {focus.part && <span className="uppercase font-bold text-slate-600">{focus.part}</span>}
                        <span className="text-slate-500">size {focus.size} · no. {focus.seq} · roll {focus.roll_id}{focus.bundle_code ? ` · ${focus.bundle_code}` : ''}</span>
                        <span className="text-slate-500">{focus.rejected_earlier ? <>rejected at <b>{focus.rejected_earlier}</b> — a replacement is re-checked there, then moves on</> : <>status here: <b>{focus.stage_status || 'PENDING'}</b></>}</span>
                        {focus.stale_open_defect && <span className="text-amber-700">(defect ticket still open although cleared)</span>}
                        <button type="button" className="ml-auto text-slate-400 hover:text-slate-700" onClick={() => setFocus(null)}>✕</button>
                    </div>
                    <table className="w-full text-[11px]">
                        <tbody>
                            {focus.defects.map((d, k) => (
                                <tr key={k} className="border-t border-slate-100">
                                    <td className={`py-1 pr-2 font-bold ${d.severity === 'QC_REJECTED' ? 'text-red-600' : 'text-amber-700'}`}>{sev(d.severity)}{d.stage ? ` (${d.stage})` : ''}</td>
                                    <td className="py-1 pr-2"><b>{d.code}</b> {d.description}</td>
                                    <td className="py-1 pr-2 text-slate-500">{d.detected_by || '—'}{d.line ? ` · ${d.line}` : ''}{d.checker_line && d.checker_line !== d.line ? ` (checker on ${d.checker_line})` : ''}</td>
                                    <td className="py-1 pr-2 text-slate-500 whitespace-nowrap">{when(d.at)}</td>
                                    <td className="py-1 text-slate-500 whitespace-nowrap">{d.resolved ? `closed ${when(d.resolved_at)}` : <span className="font-bold text-slate-700">open</span>}</td>
                                </tr>
                            ))}
                            {(focus.requests || []).map(r => (
                                <tr key={`r${r.id}`} className="border-t border-violet-100 bg-violet-50/50">
                                    <td className="py-1 pr-2 font-bold text-violet-700">Replacement</td>
                                    <td className="py-1 pr-2"><b>{r.status}</b>{r.notes ? ` — ${r.notes}` : ''}</td>
                                    <td className="py-1 pr-2 text-slate-500">asked by {r.requested_by || '—'}{r.requested_line ? ` · ${r.requested_line}` : ''}{r.accepted_by ? ` · accepted by ${r.accepted_by}` : ''}{r.resolved_by ? ` · ${r.status === 'CANCELLED' ? 'cancelled' : 'fulfilled'} by ${r.resolved_by}` : ''}</td>
                                    <td className="py-1 pr-2 text-slate-500 whitespace-nowrap">{when(r.created_at)}</td>
                                    <td className="py-1 text-slate-500 whitespace-nowrap">{r.resolved_at ? when(r.resolved_at) : r.accepted_at ? `accepted ${when(r.accepted_at)}` : ''}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Full list */}
            <details className="border-t border-slate-200">
                <summary className="px-3 py-1.5 text-[11px] font-bold text-slate-600 cursor-pointer bg-slate-50">List {items.length} {isPiece ? 'piece(s)' : 'garment(s)'}{filter ? ` — ${CAT[filter].label}` : ''}</summary>
                <div className="max-h-[30vh] overflow-auto">
                    <table className="w-full text-[11px]">
                        <thead className="bg-slate-50 text-slate-500 sticky top-0"><tr>
                            <th className="text-left px-2 py-1">{isPiece ? 'Piece' : 'Garment'}</th>{isPiece && <th className="text-left px-2 py-1">Part</th>}<th className="text-left px-2 py-1">Size / no.</th>
                            <th className="text-left px-2 py-1">Where it stands</th><th className="text-left px-2 py-1">Last defect</th><th className="text-left px-2 py-1">Found by</th><th className="text-left px-2 py-1">When</th>{isPiece && <th className="text-left px-2 py-1">Replacement</th>}
                        </tr></thead>
                        <tbody>{items.map(i => {
                            const d = i.defects[i.defects.length - 1] || {};
                            return (
                                <tr key={i.id} className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer" onClick={() => setFocus(i)}>
                                    <td className="px-2 py-1 font-mono">{i.uid}</td>{isPiece && <td className="px-2 py-1 uppercase">{i.part}</td>}
                                    <td className="px-2 py-1">{i.size} · {i.seq}</td>
                                    <td className="px-2 py-1"><span className={`inline-block w-2 h-2 rounded-sm mr-1 ${CAT[i.category].dot}`} />{CAT[i.category].label}</td>
                                    <td className="px-2 py-1">{sev(d.severity)} · <b>{d.code}</b> {d.description}</td>
                                    <td className="px-2 py-1 text-slate-500">{d.detected_by || '—'}{d.line ? ` · ${d.line}` : ''}</td>
                                    <td className="px-2 py-1 text-slate-500 whitespace-nowrap">{when(d.at)}</td>
                                    {isPiece && <td className="px-2 py-1">{i.replacement ? `${i.replacement.status}${i.replacement.requested_by ? ` · ${i.replacement.requested_by}` : ''}` : '—'}</td>}
                                </tr>
                            );
                        })}</tbody>
                    </table>
                </div>
            </details>
            {!isPiece && <p className="px-3 py-1.5 text-[10px] text-slate-500 border-t border-slate-100">Garment stage: rework and rejects are on whole garments. Material replacement is for pieces — raise it at the piece stage (numbering, preparatory, sewing) where the part is in rework.</p>}
        </div>
    );
}

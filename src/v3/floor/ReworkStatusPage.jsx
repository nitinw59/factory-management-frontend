// Rework & replacement status (19 Oct 2026, phase 4; docs/PRODUCTION_V3_PLAN.md → "Rework & replacement status page;
// floor in-charge Reject"): every piece and garment now in rework or waiting for material replacement, filtered by batch
// (main), stage, line and status, with counts per batch × stage, oldest first. Only the floor in-charge can REJECT —
// pieces / garments that can be neither repaired nor replaced, with a reason; a reject is final at that stage and the
// garment drops out of every later stage. Recent rejects are listed below.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Ban } from 'lucide-react';
import Modal from '../../shared/Modal';
import { productionApi } from '../api/productionApi';
import { apiError } from '../api/mastersApi';
import { PageHeader, Field, inputCls, PrimaryButton, SecondaryButton, ErrorBox, Loading } from '../components/ui';
import { useV3Live } from '../live';

const STATE = { REWORK: ['In rework', 'bg-amber-50 text-amber-800 border-amber-300'], REPLACEMENT_REQUESTED: ['Replacement — to pick up', 'bg-violet-50 text-violet-800 border-violet-300'],
    REPLACEMENT_PICKED_UP: ['Replacement — picked up', 'bg-sky-50 text-sky-800 border-sky-300'], REPLACEMENT_ACCEPTED: ['Replacement — at cutting', 'bg-indigo-50 text-indigo-800 border-indigo-300'] };
const ago = (t) => { const h = (Date.now() - new Date(t).getTime()) / 3600000; return h < 1 ? `${Math.max(1, Math.round(h * 60))} min` : h < 48 ? `${Math.round(h)} h` : `${Math.round(h / 24)} days`; };
const key = (x) => `${x.kind}:${x.id}:${x.stage_type_id}`;

export default function ReworkStatusPage() {
    const [params, setParams] = useSearchParams();
    const f = { batch: params.get('batch') || '', stage: params.get('stage') || '', line: params.get('line') || '', status: params.get('status') || '' };
    const [d, setD] = useState(null);
    const [all, setAll] = useState(null);           // unfiltered, for the filter choices
    const [perms, setPerms] = useState({});
    const [sel, setSel] = useState(new Set());
    const [rej, setRej] = useState(null);           // reason
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [formError, setFormError] = useState('');
    const [msg, setMsg] = useState('');
    const load = useCallback(() => {
        productionApi.floorProblems({ batch_id: f.batch || undefined, stage_type_id: f.stage || undefined, line_id: f.line || undefined, status: f.status || undefined })
            .then(r => { setD(r.data); setError(''); }).catch(err => setError(apiError(err, 'Failed to load.')));
        productionApi.floorProblems({}).then(r => setAll(r.data.items)).catch(() => {});
    }, [f.batch, f.stage, f.line, f.status]);
    useEffect(() => { load(); setSel(new Set()); }, [load]);
    useEffect(() => { productionApi.permissions().then(r => setPerms(r.data)).catch(() => {}); }, []);
    useV3Live(load);
    const choices = useMemo(() => {
        const m = (k, l) => [...new Map((all || []).filter(x => x[k]).map(x => [x[k], l(x)])).entries()];
        return { batches: m('batch_id', x => `#${x.floor_no} ${x.batch_code}`).sort((a, b) => a[1].localeCompare(b[1])), stages: m('stage_type_id', x => x.stage), lines: m('line_id', x => x.line) };
    }, [all]);
    if (!d) return <div>{error ? <ErrorBox text={error} /> : <Loading />}</div>;
    const set = (k, v) => { const p = new URLSearchParams(params); if (v) p.set(k, v); else p.delete(k); setParams(p); };
    const picked = d.items.filter(x => sel.has(key(x)));
    // One reject call per batch × stage (the server takes one stage of one batch at a time).
    const groups = [...picked.reduce((m, x) => { const k = `${x.batch_id}|${x.stage_type_id}`; if (!m.has(k)) m.set(k, []); m.get(k).push(x); return m; }, new Map()).values()];
    const reject = async () => {
        setBusy(true); setFormError('');
        try {
            let n = 0;
            for (const g of groups) {
                const r = await productionApi.floorReject({ batch_id: g[0].batch_id, stage_type_id: g[0].stage_type_id, reason: rej.trim(),
                    piece_ids: g.filter(x => x.kind === 'PIECE').map(x => x.id), garment_ids: g.filter(x => x.kind === 'GARMENT').map(x => x.id) });
                n += r.data.rejected;
            }
            setMsg(`${n} rejected — final; the garment${n === 1 ? '' : 's'} drop${n === 1 ? 's' : ''} out of the later stages.`); setRej(null); setSel(new Set()); load();
        } catch (err) { setFormError(apiError(err, 'Failed to reject.')); load(); } finally { setBusy(false); }
    };
    const sel1 = (x) => setSel(s => { const n = new Set(s); if (n.has(key(x))) n.delete(key(x)); else n.add(key(x)); return n; });
    return (
        <div>
            <PageHeader title="Rework & replacement" subtitle="Pieces and garments sent for rework or material replacement, oldest first. Only the floor in-charge can reject — and only what can be neither repaired nor replaced." />
            <div className="flex flex-wrap items-center gap-2 mb-3">
                <select className="px-3 py-2 text-sm border border-slate-300 rounded-lg min-w-[220px]" value={f.batch} onChange={e => set('batch', e.target.value)} aria-label="Batch"><option value="">All batches</option>{choices.batches.map(([id, l]) => <option key={id} value={id}>{l}</option>)}</select>
                <select className="px-3 py-2 text-sm border border-slate-300 rounded-lg" value={f.stage} onChange={e => set('stage', e.target.value)} aria-label="Stage"><option value="">All stages</option>{choices.stages.map(([id, l]) => <option key={id} value={id}>{l}</option>)}</select>
                <select className="px-3 py-2 text-sm border border-slate-300 rounded-lg" value={f.line} onChange={e => set('line', e.target.value)} aria-label="Line"><option value="">All lines</option>{choices.lines.map(([id, l]) => <option key={id} value={id}>{l}</option>)}</select>
                <select className="px-3 py-2 text-sm border border-slate-300 rounded-lg" value={f.status} onChange={e => set('status', e.target.value)} aria-label="Status">
                    <option value="">Rework and replacement</option><option value="REWORK">In rework</option><option value="REPLACEMENT">Waiting for replacement</option><option value="REQUESTED">— to pick up</option><option value="PICKED_UP">— picked up</option><option value="ACCEPTED">— at cutting</option></select>
                {perms.floorReject && <span className="ml-auto"><PrimaryButton disabled={!picked.length} onClick={() => { setFormError(''); setMsg(''); setRej(''); }}><Ban size={14} /> Reject {picked.length || ''}</PrimaryButton></span>}
            </div>
            <ErrorBox text={error} />
            {msg && <p className="mb-3 text-sm font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">{msg}</p>}
            {d.counts.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3">{d.counts.map(c => (
                    <button key={`${c.batch_id}|${c.stage_type_id}`} type="button" onClick={() => { const p = new URLSearchParams(params); p.set('batch', c.batch_id); p.set('stage', c.stage_type_id); setParams(p); }}
                        className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:border-indigo-400"><b>#{c.floor_no}</b> {c.stage}: {c.rework ? `${c.rework} rework` : ''}{c.rework && c.replacement ? ' · ' : ''}{c.replacement ? `${c.replacement} replacement` : ''}</button>
                ))}</div>
            )}
            <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto mb-5">
                <table className="w-full text-sm min-w-[980px]">
                    <thead className="bg-slate-50 text-left text-xs font-bold text-slate-500 uppercase tracking-wider"><tr>
                        {perms.floorReject && <th className="px-3 py-2 w-8"><input type="checkbox" checked={d.items.length > 0 && picked.length === d.items.length} onChange={e => setSel(e.target.checked ? new Set(d.items.map(key)) : new Set())} aria-label="Select all" /></th>}
                        <th className="px-3 py-2">Batch</th><th className="px-3 py-2">Piece / garment</th><th className="px-3 py-2">Stage · line</th><th className="px-3 py-2">Defect</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Sent by</th><th className="px-3 py-2 text-right">Since</th></tr></thead>
                    <tbody>
                        {d.items.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">Nothing in rework or waiting for replacement{f.batch || f.stage || f.line || f.status ? ' for this filter' : ''}.</td></tr>}
                        {d.items.map(x => (
                            <tr key={key(x)} className={`border-t border-slate-100 ${sel.has(key(x)) ? 'bg-rose-50/50' : ''}`}>
                                {perms.floorReject && <td className="px-3 py-2"><input type="checkbox" checked={sel.has(key(x))} onChange={() => sel1(x)} aria-label={`Select ${x.label}`} /></td>}
                                <td className="px-3 py-2 font-black">#{x.floor_no}</td>
                                <td className="px-3 py-2">{x.kind === 'PIECE' ? <><b>{x.part_name} · {x.size} #{x.no}</b><span className="block text-xs text-slate-500">roll #{x.roll_no ?? '—'} · {x.colour} · {x.label}</span></>
                                    : <><b>Garment {x.label}</b><span className="block text-xs text-slate-500">{x.size} · {x.colour}</span></>}</td>
                                <td className="px-3 py-2">{x.stage}<span className="block text-xs text-slate-500">{x.line || '—'}</span></td>
                                <td className="px-3 py-2 text-xs">{x.defect || '—'}</td>
                                <td className="px-3 py-2"><span className={`text-[11px] font-black px-2 py-0.5 rounded border ${STATE[x.state]?.[1] || ''}`}>{STATE[x.state]?.[0] || x.state}</span>{x.replacement?.pickup_skipped && <span className="block text-[11px] text-amber-700">pickup skipped</span>}</td>
                                <td className="px-3 py-2 text-xs text-slate-600">{x.sent_by || '—'}</td>
                                <td className="px-3 py-2 text-right text-xs text-slate-500 whitespace-nowrap">{ago(x.since)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {d.rejected.length > 0 && (
                <div className="bg-white border border-slate-200 rounded-xl p-4">
                    <p className="text-xs font-black uppercase tracking-wider text-slate-500 mb-2">Rejected (final)</p>
                    <div className="divide-y divide-slate-100 text-sm">{d.rejected.map(r => (
                        <p key={r.id} className="py-1.5"><span className="text-xs text-slate-400 mr-2">{new Date(r.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                            <b>#{r.floor_no}</b> {r.kind === 'PIECE' ? `${r.part_name} ${r.label}` : `garment ${r.label}`} at {r.stage} <span className="text-slate-500">— {r.reason} ({r.previous_status === 'REPLACEMENT' ? 'was waiting for replacement' : 'was in rework'}{r.rejected_by ? `, ${r.rejected_by}` : ''})</span></p>
                    ))}</div>
                </div>
            )}
            {rej !== null && (
                <Modal title={`Reject ${picked.length} — final`} onClose={() => setRej(null)}>
                    <div className="space-y-3 w-[min(480px,88vw)]">
                        <p className="text-sm text-rose-800 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">Only for pieces / garments that can be neither repaired nor replaced. A reject is final: the piece counts as done at its stage, its garment drops out of every later stage, and no replacement follows. Open replacement requests are closed.</p>
                        <ul className="text-xs text-slate-600 max-h-32 overflow-y-auto list-disc pl-5">{picked.map(x => <li key={key(x)}>#{x.floor_no} {x.kind === 'PIECE' ? `${x.part_name} ${x.size} #${x.no}` : `garment ${x.label}`} · {x.stage}</li>)}</ul>
                        <Field label="Reason *"><input className={inputCls} value={rej} onChange={e => setRej(e.target.value)} placeholder="e.g. hole through the panel, can't be mended" autoFocus /></Field>
                        <ErrorBox text={formError} />
                        <div className="flex justify-end gap-2"><SecondaryButton onClick={() => setRej(null)}>Back</SecondaryButton><PrimaryButton onClick={reject} busy={busy} disabled={busy || !rej.trim()}>Reject</PrimaryButton></div>
                    </div>
                </Modal>
            )}
        </div>
    );
}

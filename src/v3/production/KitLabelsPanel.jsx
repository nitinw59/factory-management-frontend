// Garment barcode labels of a trim kit (23 Oct 2026, backend controllers/v3/kitLabels.js — as 2.0's Garment labels panel on
// the trim order): per roll garments / printed, print a roll or all, reprint (reason), a single label by garment number,
// void a roll (reason), the print jobs (cancel a queued one, retry a failed one), the CSV backup. Labels print on the
// BarTender PC through the print agent (same printers as 2.0); a label counts as printed only when the printer confirms.
// The store manager prints; everyone else sees the status.
import { useCallback, useEffect, useState } from 'react';
import { Printer, RotateCcw, Ban, FileDown, Tag, RefreshCw, X } from 'lucide-react';
import { trimKitsApi } from '../api/trimKitsApi';
import { apiError } from '../api/mastersApi';
import { Field, inputCls, PrimaryButton, SecondaryButton, ErrorBox, Loading } from '../components/ui';

const JOB_CLS = { QUEUED: 'bg-sky-50 text-sky-800 border-sky-200', PRINTING: 'bg-indigo-50 text-indigo-800 border-indigo-200', PRINTED: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    FAILED: 'bg-rose-50 text-rose-700 border-rose-200', CANCELLED: 'bg-slate-50 text-slate-500 border-slate-200' };
const when = (d) => (d ? new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');

export default function KitLabelsPanel({ kitId, onClose, onChanged }) {
    const [d, setD] = useState(null);
    const [printer, setPrinter] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [ask, setAsk] = useState(null);   // { title, hint, field?: 'garment', run(reason, garment) }
    const [askText, setAskText] = useState('');
    const [askNo, setAskNo] = useState('');
    const load = useCallback(() => trimKitsApi.labels(kitId).then(r => { setD(r.data); setPrinter(p => p || r.data.printers.find(x => x.is_default)?.id || r.data.printers[0]?.id || ''); })
        .catch(err => setError(apiError(err, 'Failed to load the labels.'))), [kitId]);
    useEffect(() => { load(); }, [load]);
    // While a job is queued or printing, look again every 5 s (the agent prints within seconds).
    const active = d?.jobs.some(j => j.status === 'QUEUED' || j.status === 'PRINTING');
    useEffect(() => { if (!active) return undefined; const t = setInterval(load, 5000); return () => clearInterval(t); }, [active, load]);
    const run = async (fn, close) => {
        setBusy(true); setError('');
        try { const r = await fn(); setD(r.data); if (close) close(); onChanged?.(); } catch (err) { setError(apiError(err, 'Failed.')); } finally { setBusy(false); }
    };
    const askFor = (cfg) => { setAskText(''); setAskNo(''); setError(''); setAsk(cfg); };
    if (!d) return error ? <ErrorBox text={error} /> : <Loading />;
    const P = d.can_print;
    const pr = d.printers.find(x => x.id === printer);
    const unprinted = d.totals.garments - d.totals.printed;

    return (
        <div className="space-y-4 w-[min(840px,84vw)] max-h-[82vh] overflow-y-auto">
            <div className="flex flex-wrap items-center gap-3">
                <p className="text-sm text-slate-700"><b>{d.totals.printed}</b> of <b>{d.totals.garments}</b> labels printed (confirmed by the printer){unprinted > 0 ? <span className="text-amber-700"> · {unprinted} to print</span> : <span className="text-emerald-700"> · all printed</span>}</p>
                <span className="ml-auto flex items-center gap-2">
                    <button type="button" onClick={load} className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50" title="Refresh"><RefreshCw size={14} /></button>
                    <button type="button" onClick={async () => { try { const r = await trimKitsApi.labelsCsv(kitId); const url = URL.createObjectURL(r.data); const a = document.createElement('a'); a.href = url; a.download = `labels-${d.kit.kit_no.replace(/\//g, '-')}.csv`; a.click(); URL.revokeObjectURL(url); } catch (err) { setError(apiError(err, 'Failed.')); } }}
                        className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-slate-200 text-sm font-bold text-slate-700 hover:bg-slate-50"><FileDown size={14} /> CSV (backup)</button>
                </span>
            </div>
            {P && (
                <div className="flex flex-wrap items-end gap-2 bg-slate-50 border border-slate-200 rounded-xl p-3">
                    <Field label="Printer">
                        <select className={`${inputCls} min-w-[220px]`} value={printer} onChange={e => setPrinter(e.target.value)}>
                            {d.printers.length === 0 && <option value="">No printer set up (2.0 Admin → Label Printers)</option>}
                            {d.printers.map(x => <option key={x.id} value={x.id}>{x.name}{x.location ? ` · ${x.location}` : ''}{x.agent_online ? '' : ' — agent offline'}</option>)}
                        </select>
                    </Field>
                    {pr && <span className={`mb-2 text-xs font-bold ${pr.agent_online ? 'text-emerald-700' : 'text-rose-700'}`}>{pr.agent_online ? `Agent online${pr.bartender_ok === false ? ' — BarTender not ready' : ''}` : 'Agent offline — jobs wait until it is back'}</span>}
                    <span className="ml-auto flex gap-2">
                        <SecondaryButton onClick={() => askFor({ title: 'Print a single label', hint: 'Type the garment number on the label (e.g. a torn or lost one).', field: 'garment', run: (reason, no) => trimKitsApi.singleLabel(kitId, { printer_id: printer, garment_no: no, reason }) })}><Tag size={14} /> Single label</SecondaryButton>
                        <PrimaryButton busy={busy} disabled={busy || !printer || unprinted === 0} onClick={() => run(() => trimKitsApi.printLabels(kitId, { printer_id: printer }))}><Printer size={14} /> Print all unprinted ({unprinted})</PrimaryButton>
                    </span>
                </div>
            )}
            <ErrorBox text={error} />

            <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
                <table className="w-full text-sm min-w-[720px]">
                    <thead className="text-[11px] font-black uppercase tracking-wider text-slate-500 bg-slate-50 text-left"><tr><th className="px-3 py-2">Roll</th><th className="px-3 py-2">Numbers</th><th className="px-3 py-2 text-right">Garments</th><th className="px-3 py-2 text-right">Printed</th><th className="px-3 py-2">Last job</th><th className="px-3 py-2" /></tr></thead>
                    <tbody>
                        {d.rolls.map(r => (
                            <tr key={r.batch_roll_id} className="border-t border-slate-100">
                                <td className="px-3 py-2 font-black text-slate-800">Roll {r.roll_label}</td>
                                <td className="px-3 py-2 text-xs text-slate-600 font-mono">{r.first_no} … {r.last_no}</td>
                                <td className="px-3 py-2 text-right tabular-nums">{r.garments}</td>
                                <td className={`px-3 py-2 text-right tabular-nums font-bold ${r.printed === r.garments ? 'text-emerald-700' : r.printed ? 'text-amber-700' : 'text-slate-400'}`}>{r.printed}</td>
                                <td className="px-3 py-2">{r.last_job_status ? <span className={`text-[10px] font-black px-1.5 py-0.5 rounded border ${JOB_CLS[r.last_job_status]}`}>{r.last_job_status.toLowerCase()}</span> : <span className="text-xs text-slate-400">—</span>}</td>
                                <td className="px-3 py-2 text-right whitespace-nowrap">{P && (<span className="inline-flex gap-1">
                                    {r.printed < r.garments && <button type="button" disabled={busy || !printer || Boolean(r.open_job_id)} onClick={() => run(() => trimKitsApi.printLabels(kitId, { printer_id: printer, batch_roll_id: r.batch_roll_id }))} className="px-2 py-1 rounded border border-indigo-200 bg-indigo-50 text-indigo-700 text-xs font-bold disabled:opacity-40">Print {r.garments - r.printed}</button>}
                                    {r.printed > 0 && <button type="button" disabled={busy || !printer || Boolean(r.open_job_id)} onClick={() => askFor({ title: `Reprint roll ${r.roll_label}`, hint: `All ${r.garments} labels of the roll print again.`, run: (reason) => trimKitsApi.printLabels(kitId, { printer_id: printer, batch_roll_id: r.batch_roll_id, reprint: true, reason }) })} className="px-2 py-1 rounded border border-slate-200 text-slate-700 text-xs font-bold disabled:opacity-40 inline-flex items-center gap-1"><RotateCcw size={11} /> Reprint</button>}
                                    {r.printed > 0 && <button type="button" disabled={busy} onClick={() => askFor({ title: `Void the labels of roll ${r.roll_label}`, hint: `The ${r.printed} printed labels are no longer valid (destroy them); the roll prints again.`, run: (reason) => trimKitsApi.voidLabels(kitId, { batch_roll_id: r.batch_roll_id, reason }) })} className="px-2 py-1 rounded border border-rose-200 text-rose-700 text-xs font-bold inline-flex items-center gap-1"><Ban size={11} /> Void</button>}
                                </span>)}</td>
                            </tr>
                        ))}
                        <tr className="border-t-2 border-slate-200 bg-slate-50 font-black text-slate-700"><td className="px-3 py-2" colSpan={2}>{d.rolls.length} roll(s)</td><td className="px-3 py-2 text-right tabular-nums">{d.totals.garments}</td><td className="px-3 py-2 text-right tabular-nums">{d.totals.printed}</td><td className="px-3 py-2" colSpan={2} /></tr>
                    </tbody>
                </table>
            </div>

            <div>
                <p className="text-xs font-black uppercase tracking-widest text-slate-500 mb-1">Print jobs</p>
                {d.jobs.length === 0 ? <p className="text-sm text-slate-400">No labels printed yet.</p> : (
                    <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
                        {d.jobs.map(j => (
                            <div key={j.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
                                <span className={`text-[10px] font-black px-1.5 py-0.5 rounded border ${JOB_CLS[j.status]}`}>{j.status.toLowerCase()}</span>
                                <b className="text-slate-800">{j.job_type === 'SINGLE' ? `Single ${j.single_no || ''}` : `Roll ${j.roll_label}`}</b>
                                <span className="text-slate-600">{j.label_count} label(s){j.has_end_label ? ' + END' : ''}{j.is_reprint && j.job_type !== 'SINGLE' ? ' · reprint' : ''}{j.retry_of_job_id ? ' · retry' : ''}{j.voided_labels ? ` · ${j.voided_labels} voided` : ''}</span>
                                <span className="text-xs text-slate-500">{j.printer_name} · {j.requested_by_name || '—'} {when(j.requested_at)}{j.finished_at ? ` · done ${when(j.finished_at)}` : ''}</span>
                                {(j.reason || j.cancel_reason || j.error_message) && <span className="basis-full text-xs text-slate-500">{j.reason ? `Reason: ${j.reason}` : ''}{j.cancel_reason ? ` Cancelled: ${j.cancel_reason}` : ''}{j.error_message ? <span className="text-rose-700"> {j.error_message}</span> : null}</span>}
                                {P && <span className="ml-auto flex gap-1">
                                    {j.status === 'QUEUED' && <button type="button" onClick={() => askFor({ title: 'Cancel the print job', run: (reason) => trimKitsApi.cancelLabelJob(kitId, j.id, reason) })} className="px-2 py-1 rounded border border-slate-200 text-xs font-bold text-slate-600 inline-flex items-center gap-1"><X size={11} /> Cancel</button>}
                                    {j.status === 'FAILED' && <button type="button" disabled={busy} onClick={() => run(() => trimKitsApi.retryLabelJob(kitId, j.id, { printer_id: printer || undefined }))} className="px-2 py-1 rounded border border-indigo-200 bg-indigo-50 text-xs font-bold text-indigo-700">Retry</button>}
                                </span>}
                            </div>
                        ))}
                    </div>
                )}
            </div>
            {d.voids.length > 0 && (
                <div>
                    <p className="text-xs font-black uppercase tracking-widest text-slate-500 mb-1">Voided labels</p>
                    <ul className="text-xs text-slate-600 space-y-0.5">{d.voids.map(v => <li key={v.id}>{when(v.created_at)} · {v.labels} label(s){v.roll_label ? ` of roll ${v.roll_label}` : ''} — {v.source === 'UNFINALIZE' ? 'batch went back to cutting' : v.user_name || ''}: {v.reason}</li>)}</ul>
                </div>
            )}
            <div className="flex justify-end"><SecondaryButton onClick={onClose}>Close</SecondaryButton></div>

            {ask && (
                <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4" role="dialog" aria-modal="true">
                    <div className="bg-white rounded-2xl shadow-xl p-5 space-y-3 w-[min(440px,92vw)]">
                        <p className="text-lg font-black text-slate-900">{ask.title}</p>
                        {ask.hint && <p className="text-sm text-slate-600">{ask.hint}</p>}
                        {ask.field === 'garment' && <Field label="Garment number *"><input className={`${inputCls} font-mono`} value={askNo} onChange={e => setAskNo(e.target.value)} placeholder="e.g. 501-1-30-017" autoFocus /></Field>}
                        <Field label="Reason *"><input className={inputCls} value={askText} onChange={e => setAskText(e.target.value)} autoFocus={ask.field !== 'garment'} /></Field>
                        <ErrorBox text={error} />
                        <div className="flex justify-end gap-2"><SecondaryButton onClick={() => setAsk(null)}>Back</SecondaryButton>
                            <PrimaryButton busy={busy} disabled={busy || askText.trim().length < 3 || (ask.field === 'garment' && !askNo.trim())} onClick={() => run(() => ask.run(askText.trim(), askNo.trim()), () => setAsk(null))}>Confirm</PrimaryButton></div>
                    </div>
                </div>
            )}
        </div>
    );
}

// Bundle barcode labels of a finalised cut batch (24 Oct 2026, backend controllers/v3/bundleLabels.js): preview every
// bundle (roll × part × size × colour) with its code, style, batch, roll, size, colour, part and number range; choose the
// parts to print — remembered on this device ("let user select parts and save in his local memory", e.g. BACK, FRONT,
// BELT); print through the BarTender print agent (the bundle-label printer entry); reprint with a reason; jobs (cancel /
// retry); CSV. Cutting manager and store manager print.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Printer, RotateCcw, FileDown, RefreshCw, X } from 'lucide-react';
import { cuttingApi } from '../api/cuttingApi';
import { apiError } from '../api/mastersApi';
import { Field, inputCls, PrimaryButton, SecondaryButton, ErrorBox, Loading } from '../components/ui';

const PARTS_KEY = 'v3.bundleLabels.parts';   // part names, upper case — the same parts tick on every batch
const PRINTER_KEY = 'v3.bundleLabels.printer';
const readJson = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* per-device convenience only */ } };
const JOB_CLS = { QUEUED: 'bg-sky-50 text-sky-800 border-sky-200', PRINTING: 'bg-indigo-50 text-indigo-800 border-indigo-200', PRINTED: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    FAILED: 'bg-rose-50 text-rose-700 border-rose-200', CANCELLED: 'bg-slate-50 text-slate-500 border-slate-200' };
const when = (d) => (d ? new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');

export default function BundleLabelsPanel({ batchId, onClose }) {
    const [d, setD] = useState(null);
    const [picked, setPicked] = useState(() => new Set(readJson(PARTS_KEY, [])));
    const [printer, setPrinter] = useState(() => readJson(PRINTER_KEY, ''));
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [ask, setAsk] = useState(null);   // { title, hint, run(reason) }
    const [askText, setAskText] = useState('');
    const load = useCallback(() => cuttingApi.bundleLabels(batchId).then(r => {
        setD(r.data);
        // first time on this device (nothing saved): every part ticked
        setPicked(p => (p.size ? p : new Set(r.data.parts.map(x => x.name.toUpperCase()))));
        setPrinter(p => (p && r.data.printers.some(x => x.id === p) ? p : r.data.printers.find(x => x.is_default)?.id || r.data.printers[0]?.id || ''));
    }).catch(err => setError(apiError(err, 'Failed to load the bundles.'))), [batchId]);
    useEffect(() => { load(); }, [load]);
    const active = d?.jobs.some(j => j.status === 'QUEUED' || j.status === 'PRINTING');
    useEffect(() => { if (!active) return undefined; const t = setInterval(load, 5000); return () => clearInterval(t); }, [active, load]);
    const parts = d?.parts || [];
    const on = (p) => picked.has(p.name.toUpperCase());
    const toggle = (p) => { const n = new Set(picked); const k = p.name.toUpperCase(); if (n.has(k)) n.delete(k); else n.add(k); setPicked(n); save(PARTS_KEY, [...n]); };
    const chosen = parts.filter(on);
    const rows = useMemo(() => (d ? d.bundles.filter(b => picked.has(b.part.toUpperCase())) : []), [d, picked]);
    // Groups in the server's print order: mode 1 roll by roll; mode 2 part × size across the rolls (numbers run on).
    const mode2 = d?.batch?.numbering_mode === 'MODE_2';
    const groups = useMemo(() => {
        const out = [];
        for (const b of rows) { const k = mode2 ? `${b.part}|${b.size}` : b.roll; if (out.length && out[out.length - 1][0] === k) out[out.length - 1][1].push(b); else out.push([k, [b]]); }
        return out;
    }, [rows, mode2]);
    const rollCount = new Set(rows.map(b => b.roll)).size;
    const unprinted = rows.filter(b => !b.printed_at).length;
    const run = async (fn, close) => {
        setBusy(true); setError('');
        try { const r = await fn(); setD(r.data); if (close) close(); } catch (err) { setError(apiError(err, 'Failed.')); } finally { setBusy(false); }
    };
    if (!d) return error ? <ErrorBox text={error} /> : <Loading />;
    const P = d.can_print;
    const pr = d.printers.find(x => x.id === printer);
    const partIds = chosen.map(p => p.id);

    return (
        <div className="space-y-4 w-[min(920px,82vw)] max-h-[82vh] overflow-y-auto">
            <p className="text-sm text-slate-600"><b>#{d.batch.floor_no}</b> {d.batch.batch_code} · {d.batch.style} · {d.batch.order_no}</p>
            <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-black uppercase tracking-widest text-slate-500">Parts to print</span>
                {parts.map(p => (
                    <button key={p.id} type="button" onClick={() => toggle(p)} aria-pressed={on(p)}
                        className={`px-3 py-1.5 rounded-full border text-sm font-bold ${on(p) ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-300'}`}>
                        {on(p) ? '☑' : '☐'} {p.name} <span className={`text-xs font-normal ${on(p) ? 'text-indigo-100' : 'text-slate-400'}`}>{p.bundles} · {p.printed} printed</span>
                    </button>
                ))}
                <span className="text-xs text-slate-400">remembered on this device</span>
                <button type="button" onClick={load} className="ml-auto p-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50" title="Refresh"><RefreshCw size={14} /></button>
            </div>
            {P && (
                <div className="flex flex-wrap items-end gap-2 bg-slate-50 border border-slate-200 rounded-xl p-3">
                    <Field label="Bundle label printer">
                        <select className={`${inputCls} min-w-[240px]`} value={printer} onChange={e => { setPrinter(e.target.value); save(PRINTER_KEY, e.target.value); }}>
                            {d.printers.length === 0 && <option value="">No printer set up (2.0 Admin → Label Printers)</option>}
                            {d.printers.map(x => <option key={x.id} value={x.id}>{x.name}{x.location ? ` · ${x.location}` : ''}{x.agent_online ? '' : ' — agent offline'}</option>)}
                        </select>
                    </Field>
                    {pr && <span className={`mb-2 text-xs font-bold ${pr.agent_online ? 'text-emerald-700' : 'text-rose-700'}`}>{pr.agent_online ? 'Agent online' : 'Agent offline — the job waits until it is back'}</span>}
                    <span className="ml-auto flex gap-2">
                        <button type="button" onClick={async () => { try { const r = await cuttingApi.bundleLabelsCsv(batchId, partIds); const url = URL.createObjectURL(r.data); const a = document.createElement('a'); a.href = url; a.download = `bundle-labels-${d.batch.floor_no}.csv`; a.click(); URL.revokeObjectURL(url); } catch (err) { setError(apiError(err, 'Failed.')); } }}
                            disabled={!partIds.length} className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm font-bold text-slate-700 disabled:opacity-40"><FileDown size={14} /> CSV</button>
                        <SecondaryButton disabled={busy || !printer || !partIds.length || active} onClick={() => { setAskText(''); setAsk({ title: `Reprint ${rows.length} bundle label(s)`, hint: `${chosen.map(p => p.name).join(', ')} — every bundle of these parts prints again.`, run: (reason) => cuttingApi.printBundleLabels(batchId, { part_ids: partIds, printer_id: printer, reprint: true, reason }) }); }}><RotateCcw size={14} /> Reprint</SecondaryButton>
                        <PrimaryButton busy={busy} disabled={busy || !printer || !partIds.length || unprinted === 0 || active} onClick={() => run(() => cuttingApi.printBundleLabels(batchId, { part_ids: partIds, printer_id: printer }))}><Printer size={14} /> Print {unprinted} bundle label(s)</PrimaryButton>
                    </span>
                </div>
            )}
            <ErrorBox text={error} />

            <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
                <table className="w-full text-sm min-w-[880px]">
                    <thead className="text-[11px] font-black uppercase tracking-wider text-slate-500 bg-slate-50 text-left">
                        <tr><th className="px-3 py-2">Bundle (barcode)</th><th className="px-3 py-2">Style</th><th className="px-3 py-2">Batch</th><th className="px-3 py-2">Roll</th><th className="px-3 py-2">Size</th><th className="px-3 py-2">Colour</th><th className="px-3 py-2">Part</th><th className="px-3 py-2 text-right">Numbers</th><th className="px-3 py-2 text-right">Pieces</th><th className="px-3 py-2">Printed</th></tr>
                    </thead>
                    <tbody>
                        {rows.length === 0 && <tr><td colSpan={10} className="px-3 py-6 text-center text-slate-400">Choose the parts to print.</td></tr>}
                        {groups.map(([, list]) => list.map((b, i) => (
                            <tr key={b.id} className={`border-t ${i === 0 ? 'border-slate-300' : 'border-slate-100'}`}>
                                <td className="px-3 py-1.5 font-mono font-black text-slate-900">{b.bundle_code}{b.source === 'LABEL' ? <span className="ml-1 text-[10px] font-sans font-bold text-slate-400">label only</span> : null}</td>
                                <td className="px-3 py-1.5 text-xs text-slate-600">{b.style}</td>
                                <td className="px-3 py-1.5 font-bold">#{b.batch}</td>
                                <td className="px-3 py-1.5 font-bold">{b.roll}</td>
                                <td className="px-3 py-1.5 font-bold">{b.size}</td>
                                <td className="px-3 py-1.5">{b.colour || '—'}</td>
                                <td className="px-3 py-1.5 font-semibold">{b.part}</td>
                                <td className="px-3 py-1.5 text-right tabular-nums">{b.seq_from} – {b.seq_to}</td>
                                <td className="px-3 py-1.5 text-right tabular-nums">{b.pieces}</td>
                                <td className="px-3 py-1.5 text-xs">{b.printed_at ? <span className="text-emerald-700 font-bold">{when(b.printed_at)}</span> : <span className="text-slate-400">—</span>}</td>
                            </tr>
                        )))}
                        {rows.length > 0 && <tr className="border-t-2 border-slate-300 bg-slate-50 font-black text-slate-700"><td className="px-3 py-2" colSpan={7}>{rows.length} bundle(s) · {rollCount} roll(s) · {chosen.length} part(s){mode2 ? ' · mode 2: per part and size across the rolls' : ''}</td><td className="px-3 py-2" /><td className="px-3 py-2 text-right tabular-nums">{rows.reduce((a, b) => a + b.pieces, 0)}</td><td className="px-3 py-2 text-xs">{rows.length - unprinted} printed</td></tr>}
                    </tbody>
                </table>
            </div>

            <div>
                <p className="text-xs font-black uppercase tracking-widest text-slate-500 mb-1">Print jobs</p>
                {d.jobs.length === 0 ? <p className="text-sm text-slate-400">No bundle labels printed yet.</p> : (
                    <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
                        {d.jobs.map(j => (
                            <div key={j.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
                                <span className={`text-[10px] font-black px-1.5 py-0.5 rounded border ${JOB_CLS[j.status]}`}>{j.status.toLowerCase()}</span>
                                <b className="text-slate-800">{j.label_count} label(s)</b><span className="text-slate-600">{j.parts}{j.is_reprint ? ' · reprint' : ''}{j.retry_of_job_id ? ' · retry' : ''}</span>
                                <span className="text-xs text-slate-500">{j.printer_name} · {j.requested_by_name || '—'} {when(j.requested_at)}{j.finished_at ? ` · done ${when(j.finished_at)}` : ''}</span>
                                {(j.reason || j.cancel_reason || j.error_message) && <span className="basis-full text-xs text-slate-500">{j.reason ? `Reason: ${j.reason}` : ''}{j.cancel_reason ? ` Cancelled: ${j.cancel_reason}` : ''}{j.error_message ? <span className="text-rose-700"> {j.error_message}</span> : null}</span>}
                                {P && <span className="ml-auto flex gap-1">
                                    {j.status === 'QUEUED' && <button type="button" onClick={() => { setAskText(''); setAsk({ title: 'Cancel the print job', run: (reason) => cuttingApi.cancelBundleLabelJob(batchId, j.id, reason) }); }} className="px-2 py-1 rounded border border-slate-200 text-xs font-bold text-slate-600 inline-flex items-center gap-1"><X size={11} /> Cancel</button>}
                                    {j.status === 'FAILED' && <button type="button" disabled={busy} onClick={() => run(() => cuttingApi.retryBundleLabelJob(batchId, j.id, { printer_id: printer || undefined }))} className="px-2 py-1 rounded border border-indigo-200 bg-indigo-50 text-xs font-bold text-indigo-700">Retry</button>}
                                </span>}
                            </div>
                        ))}
                    </div>
                )}
            </div>
            <div className="flex justify-end"><SecondaryButton onClick={onClose}>Close</SecondaryButton></div>

            {ask && (
                <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4" role="dialog" aria-modal="true">
                    <div className="bg-white rounded-2xl shadow-xl p-5 space-y-3 w-[min(440px,92vw)]">
                        <p className="text-lg font-black text-slate-900">{ask.title}</p>
                        {ask.hint && <p className="text-sm text-slate-600">{ask.hint}</p>}
                        <Field label="Reason *"><input className={inputCls} value={askText} onChange={e => setAskText(e.target.value)} autoFocus /></Field>
                        <ErrorBox text={error} />
                        <div className="flex justify-end gap-2"><SecondaryButton onClick={() => setAsk(null)}>Back</SecondaryButton>
                            <PrimaryButton busy={busy} disabled={busy || askText.trim().length < 3} onClick={() => run(() => ask.run(askText.trim()), () => setAsk(null))}>Confirm</PrimaryButton></div>
                    </div>
                </div>
            )}
        </div>
    );
}

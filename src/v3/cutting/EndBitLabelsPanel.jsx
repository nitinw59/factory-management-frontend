// End bit labels of a cut batch (28 Oct 2026, backend controllers/v3/endBitLabels.js; asked: "like we print bundle labels …
// build modal which list all endbit and by default all selected on print it print endbit labels"): every end bit made at
// this batch (lay pieces and reserves) with its tag (the barcode), kind, roll, fabric, colour, length and status — all
// ticked when the modal opens; print the ticked ones through the BarTender print agent (the end-bit label printer entry);
// an end bit printed before prints again only with a reason; jobs (cancel / retry); CSV.
import { useCallback, useEffect, useState } from 'react';
import { Printer, FileDown, RefreshCw, X } from 'lucide-react';
import { cuttingApi } from '../api/cuttingApi';
import { apiError } from '../api/mastersApi';
import { Field, inputCls, PrimaryButton, SecondaryButton, ErrorBox, Loading } from '../components/ui';

const PRINTER_KEY = 'v3.endBitLabels.printer';
const readJson = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* per-device convenience only */ } };
const JOB_CLS = { QUEUED: 'bg-sky-50 text-sky-800 border-sky-200', PRINTING: 'bg-indigo-50 text-indigo-800 border-indigo-200', PRINTED: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    FAILED: 'bg-rose-50 text-rose-700 border-rose-200', CANCELLED: 'bg-slate-50 text-slate-500 border-slate-200' };
const when = (d) => (d ? new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
const fmt = (n) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
const total = (list) => Object.entries(list.reduce((a, e) => ({ ...a, [e.uom]: (a[e.uom] || 0) + Number(e.length || 0) }), {})).map(([u, v]) => `${fmt(v)} ${u}`).join(' + ') || '—';

export default function EndBitLabelsPanel({ batchId, onClose }) {
    const [d, setD] = useState(null);
    const [picked, setPicked] = useState(null);    // Set of end bit ids — all of them when the modal opens
    const [printer, setPrinter] = useState(() => readJson(PRINTER_KEY, ''));
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [ask, setAsk] = useState(null);   // { title, hint, run(reason) }
    const [askText, setAskText] = useState('');
    const load = useCallback(() => cuttingApi.endBitLabels(batchId).then(r => {
        setD(r.data);
        setPicked(p => p || new Set(r.data.end_bits.map(e => e.id)));
        setPrinter(p => (p && r.data.printers.some(x => x.id === p) ? p : r.data.printers.find(x => x.is_default)?.id || r.data.printers[0]?.id || ''));
    }).catch(err => setError(apiError(err, 'Failed to load the end bits.'))), [batchId]);
    useEffect(() => { load(); }, [load]);
    const active = d?.jobs.some(j => j.status === 'QUEUED' || j.status === 'PRINTING');
    useEffect(() => { if (!active) return undefined; const t = setInterval(load, 5000); return () => clearInterval(t); }, [active, load]);
    const run = async (fn, close) => {
        setBusy(true); setError('');
        try { const r = await fn(); setD(r.data); if (close) close(); } catch (err) { setError(apiError(err, 'Failed.')); } finally { setBusy(false); }
    };
    if (!d || !picked) return error ? <ErrorBox text={error} /> : <Loading />;
    const P = d.can_print;
    const pr = d.printers.find(x => x.id === printer);
    const list = d.end_bits;
    const chosen = list.filter(e => picked.has(e.id));
    const again = chosen.filter(e => e.printed_at);
    const allOn = list.length > 0 && chosen.length === list.length;
    const toggle = (id) => setPicked(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
    const ids = chosen.map(e => e.id);
    const print = () => {
        if (!again.length) { run(() => cuttingApi.printEndBitLabels(batchId, { end_bit_ids: ids, printer_id: printer })); return; }
        setAskText('');
        setAsk({ title: `Print ${chosen.length} end bit label(s)`, hint: `${again.map(e => e.tag).join(', ')} ${again.length === 1 ? 'is' : 'are'} printed already — give the reason to print ${again.length === 1 ? 'it' : 'them'} again.`,
            run: (reason) => cuttingApi.printEndBitLabels(batchId, { end_bit_ids: ids, printer_id: printer, reason }) });
    };

    return (
        <div className="space-y-4 w-[min(920px,82vw)] max-h-[82vh] overflow-y-auto">
            <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm text-slate-600"><b>#{d.batch.floor_no}</b> {d.batch.batch_code} · {d.batch.style} · {d.batch.order_no}</p>
                <button type="button" onClick={load} className="ml-auto p-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50" title="Refresh"><RefreshCw size={14} /></button>
            </div>
            {P && (
                <div className="flex flex-wrap items-end gap-2 bg-slate-50 border border-slate-200 rounded-xl p-3">
                    <Field label="End bit label printer">
                        <select className={`${inputCls} min-w-[240px]`} value={printer} onChange={e => { setPrinter(e.target.value); save(PRINTER_KEY, e.target.value); }}>
                            {d.printers.length === 0 && <option value="">No printer set up (2.0 Admin → Label Printers)</option>}
                            {d.printers.map(x => <option key={x.id} value={x.id}>{x.name}{x.location ? ` · ${x.location}` : ''}{x.agent_online ? '' : ' — agent offline'}</option>)}
                        </select>
                    </Field>
                    {pr && <span className={`mb-2 text-xs font-bold ${pr.agent_online ? 'text-emerald-700' : 'text-rose-700'}`}>{pr.agent_online ? 'Agent online' : 'Agent offline — the job waits until it is back'}</span>}
                    <span className="ml-auto flex gap-2">
                        <button type="button" onClick={async () => { try { const r = await cuttingApi.endBitLabelsCsv(batchId, ids); const url = URL.createObjectURL(r.data); const a = document.createElement('a'); a.href = url; a.download = `end-bit-labels-${d.batch.floor_no}.csv`; a.click(); URL.revokeObjectURL(url); } catch (err) { setError(apiError(err, 'Failed.')); } }}
                            disabled={!ids.length} className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm font-bold text-slate-700 disabled:opacity-40"><FileDown size={14} /> CSV</button>
                        <PrimaryButton busy={busy} disabled={busy || !printer || !ids.length || active} onClick={print}><Printer size={14} /> Print {ids.length} end bit label(s)</PrimaryButton>
                    </span>
                </div>
            )}
            {active && <p className="text-xs font-bold text-indigo-700">A print job is queued or printing — the next one can start when it is done.</p>}
            <ErrorBox text={error} />

            <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
                <table className="w-full text-sm min-w-[860px]">
                    <thead className="text-[11px] font-black uppercase tracking-wider text-slate-500 bg-slate-50 text-left">
                        <tr>
                            <th className="px-3 py-2 w-8">{list.length > 0 && <input type="checkbox" checked={allOn} onChange={e => setPicked(new Set(e.target.checked ? list.map(x => x.id) : []))} aria-label="Select all end bits" title="Select all" />}</th>
                            <th className="px-3 py-2">End bit (barcode)</th><th className="px-3 py-2">Kind</th><th className="px-3 py-2">Roll</th><th className="px-3 py-2">Fabric</th><th className="px-3 py-2">Colour</th>
                            <th className="px-3 py-2 text-right">Length</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Printed</th>
                        </tr>
                    </thead>
                    <tbody>
                        {list.length === 0 && <tr><td colSpan={9} className="px-3 py-6 text-center text-slate-400">This batch has no end bits.</td></tr>}
                        {list.map(e => {
                            const on = picked.has(e.id);
                            return (
                                <tr key={e.id} className={`border-t border-slate-100 ${on ? 'bg-indigo-50/40' : ''}`}>
                                    <td className="px-3 py-1.5"><input type="checkbox" checked={on} onChange={() => toggle(e.id)} aria-label={`Print ${e.tag}`} /></td>
                                    <td className="px-3 py-1.5 font-mono font-black text-slate-900">{e.tag}</td>
                                    <td className="px-3 py-1.5 text-xs font-bold">{e.kind_label}</td>
                                    <td className="px-3 py-1.5 font-bold">{e.roll || '—'}</td>
                                    <td className="px-3 py-1.5 text-xs text-slate-600">{e.fabric}</td>
                                    <td className="px-3 py-1.5">{e.colour || '—'}</td>
                                    <td className="px-3 py-1.5 text-right tabular-nums">{fmt(e.length)} {e.uom}</td>
                                    <td className="px-3 py-1.5 text-xs">{String(e.status || '').toLowerCase().replace(/_/g, ' ')}</td>
                                    <td className="px-3 py-1.5 text-xs">{e.printed_at ? <span className="text-emerald-700 font-bold">{when(e.printed_at)}</span> : <span className="text-slate-400">—</span>}</td>
                                </tr>
                            );
                        })}
                        {list.length > 0 && (
                            <tr className="border-t-2 border-slate-300 bg-slate-50 font-black text-slate-700">
                                <td className="px-3 py-2" /><td className="px-3 py-2" colSpan={5}>Total {list.length} end bit(s) · {chosen.length} selected{again.length ? ` (${again.length} printed before)` : ''}</td>
                                <td className="px-3 py-2 text-right tabular-nums">{total(list)}</td><td className="px-3 py-2" /><td className="px-3 py-2 text-xs">{list.filter(e => e.printed_at).length} printed</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            <div>
                <p className="text-xs font-black uppercase tracking-widest text-slate-500 mb-1">Print jobs</p>
                {d.jobs.length === 0 ? <p className="text-sm text-slate-400">No end bit labels printed yet.</p> : (
                    <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
                        {d.jobs.map(j => (
                            <div key={j.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
                                <span className={`text-[10px] font-black px-1.5 py-0.5 rounded border ${JOB_CLS[j.status]}`}>{j.status.toLowerCase()}</span>
                                <b className="text-slate-800">{j.label_count} label(s)</b><span className="text-slate-600 truncate max-w-[340px]" title={j.tags || ''}>{j.tags}{j.is_reprint ? ' · again' : ''}{j.retry_of_job_id ? ' · retry' : ''}</span>
                                <span className="text-xs text-slate-500">{j.printer_name} · {j.requested_by_name || '—'} {when(j.requested_at)}{j.finished_at ? ` · done ${when(j.finished_at)}` : ''}</span>
                                {(j.reason || j.cancel_reason || j.error_message) && <span className="basis-full text-xs text-slate-500">{j.reason ? `Reason: ${j.reason}` : ''}{j.cancel_reason ? ` Cancelled: ${j.cancel_reason}` : ''}{j.error_message ? <span className="text-rose-700"> {j.error_message}</span> : null}</span>}
                                {P && <span className="ml-auto flex gap-1">
                                    {j.status === 'QUEUED' && <button type="button" onClick={() => { setAskText(''); setAsk({ title: 'Cancel the print job', run: (reason) => cuttingApi.cancelEndBitLabelJob(batchId, j.id, reason) }); }} className="px-2 py-1 rounded border border-slate-200 text-xs font-bold text-slate-600 inline-flex items-center gap-1"><X size={11} /> Cancel</button>}
                                    {j.status === 'FAILED' && <button type="button" disabled={busy} onClick={() => run(() => cuttingApi.retryEndBitLabelJob(batchId, j.id, { printer_id: printer || undefined }))} className="px-2 py-1 rounded border border-indigo-200 bg-indigo-50 text-xs font-bold text-indigo-700">Retry</button>}
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

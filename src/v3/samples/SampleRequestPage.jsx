// One sample request — /v3/samples/new and /v3/samples/:id (26 Nov 2026, migration 91; backend samplesController.js).
// Draft: the merchandiser picks the order line, type, round, needed-by and the garments per colour × size (a size set
// fills 1 per size per colour), then submits — the Order BOM gives the trims (a trim order of kind SAMPLE, handed over in
// kits by the trim store) and the fabric (issued by the fabric store in metres off a free roll). Owner decisions: the
// store records each handover (receiver's name typed — sampling has no login yet); everything from free stock.
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Send, Save, Ban, CheckCircle2, Scissors, Undo2, Pencil, PackageOpen } from 'lucide-react';
import Modal from '../../shared/Modal';
import { samplesApi } from '../api/samplesApi';
import { apiError } from '../api/mastersApi';
import { useV3Live } from '../live';
import { Field, inputCls, PrimaryButton, SecondaryButton, ErrorBox, Loading } from '../components/ui';
import { SAMPLE_STATUS } from './SamplesPage';

const qty = (n) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 3 });
const when = (d) => (d ? new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
const TRIM_TEXT = { OPEN: 'to hand over', PARTLY_ISSUED: 'handed over in part', ISSUED: 'handed over', CLOSED: 'closed', CANCELLED: 'cancelled' };
const ACTION = { CREATED: 'Raised', SUBMITTED: 'Submitted', CANCELLED: 'Cancelled', CLOSED: 'Closed', TRIMS_ISSUED: 'Trims handed to sampling', FABRIC_ISSUED: 'Fabric handed to sampling', FABRIC_CHANGED: 'Fabric need changed', RETURNED: 'Came back' };

export default function SampleRequestPage() {
    const { id } = useParams();
    return id === 'new' ? <Editor key="new" /> : <RequestView key={id} id={id} />;
}

// ── raise / change a draft ────────────────────────────────────────────────────────────────────────────────────────────
function Editor({ request = null, onSaved }) {
    const navigate = useNavigate();
    const [types, setTypes] = useState([]);
    const [q, setQ] = useState('');
    const [lines, setLines] = useState(null);
    const [line, setLine] = useState(request ? { id: request.order_line_id, order_no: request.order_no, line_no: request.line_no, style_code: request.style_code, customer_name: request.customer_name, bom_id: request.bom_id } : null);
    const [grid, setGrid] = useState(request ? request.grid : null);
    const [cells, setCells] = useState(() => new Map((request?.cells || []).map(c => [`${c.colour_id}|${c.size_id}`, String(c.qty)])));
    const [f, setF] = useState({ sample_type_id: request?.sample_type_id || '', round_no: String(request?.round_no || 1), needed_by: request?.needed_by || '', notes: request?.notes || '' });
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    useEffect(() => { samplesApi.types().then(r => setTypes(r.data)).catch(() => {}); }, []);
    useEffect(() => {
        if (line) return undefined;
        const t = setTimeout(() => samplesApi.orderLines(q).then(r => setLines(r.data)).catch(err => setError(apiError(err, 'Failed to load order lines.'))), 250);
        return () => clearTimeout(t);
    }, [q, line]);
    const pick = async (l) => { setLine(l); setGrid(null); setCells(new Map()); try { setGrid((await samplesApi.lineGrid(l.id)).data); } catch (err) { setError(apiError(err, 'Failed.')); } };
    const type = types.find(t => t.id === f.sample_type_id);
    const val = (c, s) => cells.get(`${c}|${s}`) || '';
    const set = (c, s, v) => setCells(m => new Map(m).set(`${c}|${s}`, v));
    const total = [...cells.values()].reduce((a, v) => a + (Number(v) || 0), 0);
    const sizeSet = () => setCells(new Map(grid.colours.flatMap(c => grid.sizes.map(s => [`${c.id}|${s.id}`, '1']))));
    const body = () => ({ ...(request ? {} : { order_line_id: line.id }), sample_type_id: f.sample_type_id, round_no: Number(f.round_no) || 1, needed_by: f.needed_by || null, notes: f.notes.trim() || null,
        cells: [...cells.entries()].filter(([, v]) => Number(v) > 0).map(([k, v]) => { const [colour_id, size_id] = k.split('|'); return { colour_id, size_id, qty: Number(v) }; }) });
    const save = async (submit) => {
        setBusy(true); setError('');
        try {
            let r = request ? await samplesApi.update(request.id, body()) : await samplesApi.create(body());
            if (submit) r = await samplesApi.submit(r.data.id);
            if (onSaved) onSaved(r.data); else navigate(`/v3/samples/${r.data.id}`, { replace: true });
        } catch (err) { setError(apiError(err, 'Failed to save.')); } finally { setBusy(false); }
    };
    const ready = line && grid && f.sample_type_id && total > 0;
    return (
        <div>
            {!request && <Link to="/v3/samples" className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-indigo-600 mb-3"><ArrowLeft size={15} /> Samples</Link>}
            {!request && <h1 className="text-2xl font-black text-slate-900 mb-3">New sample request</h1>}
            <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4 max-w-[1100px]">
                {!line ? (
                    <div>
                        <Field label="Order line *"><input className={inputCls} value={q} onChange={e => setQ(e.target.value)} placeholder="Search order, buyer PO, style, customer" autoFocus /></Field>
                        {!lines ? <Loading /> : (
                            <div className="mt-2 max-h-72 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
                                {lines.map(l => (
                                    <button key={l.id} type="button" onClick={() => pick(l)} className="w-full text-left px-3 py-2 hover:bg-indigo-50 text-sm flex flex-wrap gap-x-3">
                                        <b>{l.order_no}</b><span>line {l.line_no}</span><span>{l.style_code} {l.style_name}</span><span className="text-slate-500">{l.customer_name}{l.buyer_po_no ? ` · PO ${l.buyer_po_no}` : ''}</span>
                                        <span className="ml-auto text-xs text-slate-500">{l.ordered || 0} ordered · {l.order_status.toLowerCase()}{!l.bom_id ? ' · no BOM yet' : ''}</span>
                                    </button>
                                ))}
                                {lines.length === 0 && <p className="px-3 py-3 text-sm text-slate-400">No order lines.</p>}
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="flex flex-wrap items-baseline gap-x-3 text-sm">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Order line</span>
                        <b>{line.order_no}</b><span>line {line.line_no}</span><span>{line.style_code}</span><span className="text-slate-500">{line.customer_name}</span>
                        {!line.bom_id && <span className="text-xs font-bold text-rose-700">no BOM yet — the sample can't be submitted until the line has one</span>}
                        {!request && <button type="button" className="text-xs font-bold text-indigo-700 hover:underline" onClick={() => { setLine(null); setGrid(null); }}>change</button>}
                    </div>
                )}
                <div className="grid sm:grid-cols-4 gap-3">
                    <Field label="Sample type *">
                        <select className={inputCls} value={f.sample_type_id} onChange={e => setF({ ...f, sample_type_id: e.target.value })}>
                            <option value="">— pick —</option>{types.map(t => <option key={t.id} value={t.id}>{t.name}{t.issues_material ? '' : ' (from bulk)'}</option>)}
                        </select>
                    </Field>
                    <Field label="Round"><input className={inputCls} type="number" min="1" max="99" value={f.round_no} onChange={e => setF({ ...f, round_no: e.target.value })} /></Field>
                    <Field label="Needed by"><input className={inputCls} type="date" value={f.needed_by} onChange={e => setF({ ...f, needed_by: e.target.value })} /></Field>
                    <Field label="Note"><input className={inputCls} value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} placeholder="e.g. buyer's size set, with wash" /></Field>
                </div>
                {type && !type.issues_material && <p className="text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">{type.name} samples are pulled from bulk garments — nothing is issued; the request is recorded and closed on submit.</p>}
                {line && (!grid ? <Loading /> : (
                    <div>
                        <div className="flex items-center gap-3 mb-1.5"><span className="text-xs font-bold uppercase tracking-wider text-slate-500">Garments per colour × size</span>
                            <button type="button" className="text-xs font-bold text-indigo-700 hover:underline" onClick={sizeSet}>Size set — 1 per size per colour</button>
                            <button type="button" className="text-xs font-bold text-slate-500 hover:underline" onClick={() => setCells(new Map())}>clear</button></div>
                        <div className="overflow-x-auto border border-slate-200 rounded-lg">
                            <table className="text-sm">
                                <thead className="bg-slate-50 text-xs font-bold text-slate-500"><tr><th className="px-3 py-1.5 text-left">Colour</th>{grid.sizes.map(s => <th key={s.id} className="px-2 py-1.5 text-center">{s.name}</th>)}<th className="px-3 py-1.5 text-right">Total</th></tr></thead>
                                <tbody>{grid.colours.map(c => (
                                    <tr key={c.id} className="border-t border-slate-100">
                                        <td className="px-3 py-1 font-semibold whitespace-nowrap">{c.name}</td>
                                        {grid.sizes.map(s => <td key={s.id} className="px-1 py-1"><input className="w-14 px-1.5 py-1 text-center border border-slate-300 rounded" type="number" min="0" step="1" value={val(c.id, s.id)} onChange={e => set(c.id, s.id, e.target.value)} aria-label={`${c.name} ${s.name}`} /></td>)}
                                        <td className="px-3 py-1 text-right font-bold tabular-nums">{grid.sizes.reduce((a, s) => a + (Number(val(c.id, s.id)) || 0), 0)}</td>
                                    </tr>
                                ))}</tbody>
                                <tfoot><tr className="border-t-2 border-slate-200 bg-slate-50 text-xs font-bold"><td className="px-3 py-1.5">Total</td>
                                    {grid.sizes.map(s => <td key={s.id} className="px-2 py-1.5 text-center tabular-nums">{grid.colours.reduce((a, c) => a + (Number(val(c.id, s.id)) || 0), 0)}</td>)}
                                    <td className="px-3 py-1.5 text-right tabular-nums">{total}</td></tr></tfoot>
                            </table>
                        </div>
                    </div>
                ))}
                <ErrorBox text={error} />
                <div className="flex flex-wrap justify-end gap-2">
                    <SecondaryButton disabled={busy || !ready} onClick={() => save(false)}><Save size={14} /> Save draft</SecondaryButton>
                    <PrimaryButton busy={busy} disabled={busy || !ready} onClick={() => save(true)}><Send size={14} /> Save and submit — {total} garment(s)</PrimaryButton>
                </div>
            </div>
        </div>
    );
}

// ── the request ──────────────────────────────────────────────────────────────────────────────────────────────────────
function RequestView({ id }) {
    const [r, setR] = useState(null);
    const [perm, setPerm] = useState({});
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [ask, setAsk] = useState(null);           // { title, confirm, hint, run(reason) }
    const [askText, setAskText] = useState('');
    const [formError, setFormError] = useState('');
    const [issue, setIssue] = useState(null);       // fabric issue: { fabrics, picks: Map(roll → qty), name, note, own_reason }
    const [ret, setRet] = useState(null);           // returns: { lines: Map(line → qty), reason }
    const [fline, setFline] = useState(null);       // fabric need change: { line, qty, reason }
    const load = useCallback(() => samplesApi.get(id).then(x => setR(x.data)).catch(err => setError(apiError(err, 'Failed to load the sample request.'))), [id]);
    useEffect(() => { load(); samplesApi.permissions().then(x => setPerm(x.data)).catch(() => {}); }, [load]);
    useV3Live(() => { if (!issue && !ret && !fline && !ask) load(); });
    const run = async (fn, close) => {
        setBusy(true); setFormError(''); setError('');
        try { setR((await fn()).data); if (close) close(); } catch (err) { (close ? setFormError : setError)(apiError(err, 'Failed.')); } finally { setBusy(false); }
    };
    if (!r) return error ? <ErrorBox text={error} /> : <Loading />;
    const st = SAMPLE_STATUS[r.status] || SAMPLE_STATUS.DRAFT;
    const open = r.status === 'SUBMITTED';
    const askReason = (cfg) => { setAskText(''); setFormError(''); setAsk(cfg); };
    const cellQty = (c, s) => r.cells.find(x => x.colour_id === c && x.size_id === s)?.qty || 0;
    const usedColours = r.grid.colours.filter(c => r.cells.some(x => x.colour_id === c.id));
    const usedSizes = r.grid.sizes.filter(s => r.cells.some(x => x.size_id === s.id));
    const toIssue = r.fabrics.filter(f => f.to_issue > 0);
    const lines = r.slips.flatMap(s => s.lines.map(l => ({ ...l, slip: s })));
    const returnable = lines.filter(l => l.qty - l.returned > 1e-9 && (l.kind === 'TRIM' ? perm.trims : perm.fabric));
    const openIssue = async () => {
        setFormError('');
        try { const x = await samplesApi.fabricRolls(id); setIssue({ fabrics: x.data.filter(f => f.to_issue > 0), picks: new Map(), name: '', note: '', own_reason: '' }); } catch (err) { setError(apiError(err, 'Failed to load the rolls.')); }
    };
    const issueSum = (f) => f.rolls.reduce((a, x) => a + (Number(issue.picks.get(x.id)) || 0), 0);
    const usesOwn = issue && issue.fabrics.some(f => f.rolls.some(x => x.own && Number(issue.picks.get(x.id)) > 0));
    const issueOk = issue && issue.name.trim() && issue.fabrics.some(f => issueSum(f) > 0) && issue.fabrics.every(f => issueSum(f) <= f.to_issue + 1e-9 && f.rolls.every(x => (Number(issue.picks.get(x.id)) || 0) <= x.left + 1e-9)) && (!usesOwn || issue.own_reason.trim());

    if (r.status === 'DRAFT' && perm.request) {
        return (
            <div>
                <Link to="/v3/samples" className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-indigo-600 mb-3"><ArrowLeft size={15} /> Samples</Link>
                <div className="flex flex-wrap items-center gap-3 mb-3">
                    <h1 className="text-2xl font-black text-slate-900">{r.request_no}</h1><span className={`text-[11px] font-black px-2 py-0.5 rounded border ${st.cls}`}>{st.label}</span>
                    <span className="ml-auto"><SecondaryButton onClick={() => askReason({ title: `Cancel ${r.request_no}`, confirm: 'Cancel request', run: (x) => samplesApi.cancel(id, x) })}><Ban size={14} /> Cancel request</SecondaryButton></span>
                </div>
                <ErrorBox text={error} />
                <Editor request={r} onSaved={(d) => setR(d)} />
                {ask && <AskModal ask={ask} askText={askText} setAskText={setAskText} busy={busy} formError={formError} onClose={() => setAsk(null)} onRun={() => run(() => ask.run(askText.trim()), () => setAsk(null))} />}
            </div>
        );
    }

    return (
        <div>
            <Link to="/v3/samples" className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-indigo-600 mb-3"><ArrowLeft size={15} /> Samples</Link>
            <div className="flex flex-wrap items-center gap-3 mb-1">
                <h1 className="text-2xl font-black text-slate-900">{r.request_no}</h1>
                <span className="text-sm font-bold text-slate-700">{r.type_name}{r.round_no > 1 ? ` · round ${r.round_no}` : ''}</span>
                <span className={`text-[11px] font-black px-2 py-0.5 rounded border ${st.cls}`}>{st.label}</span>
            </div>
            <p className="text-sm text-slate-600 mb-1"><Link to={`/v3/orders/${r.order_id}`} className="font-semibold text-indigo-700 hover:underline">{r.order_no}</Link> · line {r.line_no}{r.style_code ? ` · ${r.style_code} ${r.style_name || ''}` : ''} · {r.customer_name}{r.buyer_po_no ? ` · PO ${r.buyer_po_no}` : ''}</p>
            <p className="text-xs text-slate-500 mb-3">{r.needed_by ? <>Needed by <b className="text-slate-700">{new Date(`${r.needed_by}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</b> · </> : ''}raised by {r.created_by_name || '—'} {when(r.created_at)}{r.submitted_at ? ` · submitted by ${r.submitted_by_name || '—'} ${when(r.submitted_at)}` : ''}{r.notes ? ` · ${r.notes}` : ''}</p>
            {['CLOSED', 'CANCELLED'].includes(r.status) && <p className="mb-3 text-sm text-slate-600"><b>{st.label}</b>{r.closed_by_name ? ` by ${r.closed_by_name}` : ''}: {r.close_reason}</p>}
            <div className="flex flex-wrap gap-2 mb-3">
                {open && perm.fabric && toIssue.length > 0 && <PrimaryButton onClick={openIssue}><Scissors size={14} /> Issue fabric…</PrimaryButton>}
                {r.trim_order && <Link to={`/v3/trim-orders/${r.trim_order.id}`}><SecondaryButton><PackageOpen size={14} /> Trims — {r.trim_order.trim_order_no}</SecondaryButton></Link>}
                {returnable.length > 0 && <SecondaryButton onClick={() => { setFormError(''); setRet({ lines: new Map(), reason: '' }); }}><Undo2 size={14} /> Record what came back…</SecondaryButton>}
                {open && (perm.request || perm.trims || perm.fabric) && <SecondaryButton onClick={() => askReason({ title: `Close ${r.request_no}`, confirm: 'Close request', hint: 'What was not issued will not be. Kits being prepared must be handed over or cancelled first.', label: 'Reason', run: (x) => samplesApi.close(id, x) })}><CheckCircle2 size={14} /> Close</SecondaryButton>}
                {open && perm.request && r.slips.length === 0 && <SecondaryButton onClick={() => askReason({ title: `Cancel ${r.request_no}`, confirm: 'Cancel request', hint: 'Nothing was issued. Its trim order is cancelled too.', run: (x) => samplesApi.cancel(id, x) })}><Ban size={14} /> Cancel</SecondaryButton>}
            </div>
            <ErrorBox text={error} />

            <div className="grid lg:grid-cols-[auto_1fr] gap-3 mb-4 items-start">
                <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
                    <p className="px-3 pt-2.5 text-xs font-bold uppercase tracking-wider text-slate-500">Garments · {r.garments}</p>
                    <table className="text-sm m-2">
                        <thead className="text-xs font-bold text-slate-500"><tr><th className="px-2 py-1 text-left">Colour</th>{usedSizes.map(s => <th key={s.id} className="px-2 py-1 text-center">{s.name}</th>)}<th className="px-2 py-1 text-right">Total</th></tr></thead>
                        <tbody>{usedColours.map(c => (
                            <tr key={c.id} className="border-t border-slate-100"><td className="px-2 py-1 font-semibold whitespace-nowrap">{c.name}</td>{usedSizes.map(s => <td key={s.id} className="px-2 py-1 text-center tabular-nums">{cellQty(c.id, s.id) || '—'}</td>)}<td className="px-2 py-1 text-right font-bold tabular-nums">{usedSizes.reduce((a, s) => a + cellQty(c.id, s.id), 0)}</td></tr>
                        ))}</tbody>
                        <tfoot><tr className="border-t-2 border-slate-200 text-xs font-bold"><td className="px-2 py-1">Total</td>{usedSizes.map(s => <td key={s.id} className="px-2 py-1 text-center tabular-nums">{usedColours.reduce((a, c) => a + cellQty(c.id, s.id), 0)}</td>)}<td className="px-2 py-1 text-right tabular-nums">{r.garments}</td></tr></tfoot>
                    </table>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-4">
                    <p className="font-bold text-slate-800 mb-1">Trims</p>
                    {!r.issues_material ? <p className="text-sm text-slate-500">Pulled from bulk garments — nothing issued.</p> : !r.trim_order ? <p className="text-sm text-slate-500">{r.status === 'DRAFT' ? 'Made when the request is submitted.' : 'The Order BOM gives no trims for these garments.'}</p> : (
                        <p className="text-sm"><Link to={`/v3/trim-orders/${r.trim_order.id}`} className="font-bold text-indigo-700 hover:underline">{r.trim_order.trim_order_no}</Link> · {r.trim_order.lines} item(s) · <b>{TRIM_TEXT[r.trim_order.status]}</b>{r.trim_order.open_kits ? ` · ${r.trim_order.open_kits} kit(s) being prepared or ready` : ''}{r.trim_order.kits_handed ? ` · ${r.trim_order.kits_handed} kit(s) handed to sampling` : ''}
                            <span className="block text-xs text-slate-500 mt-1">The trim store makes a kit on the trim order (from free stock) and hands it to sampling, typing who took it.</span></p>
                    )}
                </div>
            </div>

            {r.fabrics.length > 0 && (
                <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto mb-4">
                    <p className="px-4 pt-3 font-bold text-slate-800">Fabric <span className="text-xs font-normal text-slate-500">— Order BOM × the sample garments; the fabric store cuts it off a free roll</span></p>
                    <table className="w-full text-sm min-w-[860px] mt-2">
                        <thead className="bg-slate-50 text-xs font-bold text-slate-500 uppercase tracking-wider text-right"><tr><th className="px-3 py-2 text-left">#</th><th className="px-3 py-2 text-left">Fabric</th><th className="px-3 py-2">BOM</th><th className="px-3 py-2">Needed</th><th className="px-3 py-2">Issued</th><th className="px-3 py-2">Back</th><th className="px-3 py-2">With sampling</th><th className="px-3 py-2">To issue</th><th className="px-3 py-2" /></tr></thead>
                        <tbody>{r.fabrics.map(f => (
                            <tr key={f.id} className="border-t border-slate-100 text-right tabular-nums align-top">
                                <td className="px-3 py-2 text-left">{f.line_no}</td>
                                <td className="px-3 py-2 text-left"><span className="font-semibold">{f.label}</span>{f.changed_reason && <span className="block text-xs text-slate-500">changed: {f.changed_reason}</span>}</td>
                                <td className="px-3 py-2">{qty(f.bom_qty)} {f.uom}</td><td className="px-3 py-2 font-bold">{qty(f.qty)} {f.uom}</td>
                                <td className="px-3 py-2">{f.issued ? `${qty(f.issued)} ${f.uom}` : '—'}</td><td className="px-3 py-2">{f.returned ? `${qty(f.returned)} ${f.uom}` : '—'}</td>
                                <td className="px-3 py-2">{f.net ? `${qty(f.net)} ${f.uom}` : '—'}</td>
                                <td className={`px-3 py-2 ${f.to_issue > 0 ? 'font-bold text-amber-800' : 'text-slate-400'}`}>{f.to_issue > 0 ? `${qty(f.to_issue)} ${f.uom}` : '—'}</td>
                                <td className="px-3 py-2">{open && perm.fabric && <button type="button" className="text-xs font-bold text-indigo-700 hover:underline inline-flex items-center gap-1" onClick={() => { setFormError(''); setFline({ line: f, qty: String(f.qty), reason: '' }); }}><Pencil size={11} /> Change</button>}</td>
                            </tr>
                        ))}
                            <tr className="border-t-2 border-slate-200 bg-slate-50 text-xs font-bold"><td className="px-3 py-2" colSpan={6}>Total · {r.fabrics.length} fabric(s)</td><td /><td className="px-3 py-2 text-right text-amber-800">{toIssue.length ? `${toIssue.length} to issue` : 'all issued'}</td><td /></tr>
                        </tbody>
                    </table>
                </div>
            )}

            <div className="grid lg:grid-cols-2 gap-3">
                <div className="bg-white border border-slate-200 rounded-xl p-4">
                    <p className="font-bold text-slate-800 mb-2">Slips</p>
                    {r.slips.length === 0 ? <p className="text-sm text-slate-400">Nothing handed to sampling yet.</p> : r.slips.map(s => (
                        <div key={s.id} className="py-2 border-t border-slate-100 first:border-0 text-sm">
                            <Link to={s.series === 'TI' ? `/v3/trim-orders/slips/${s.id}` : `/v3/material-issue/issues/${s.id}`} className="font-bold text-indigo-700 hover:underline">{s.issue_no}</Link>
                            <span className="text-slate-600"> · {s.series === 'TI' ? 'trims' : 'fabric'} · to {s.received_by} · {new Date(`${s.issue_date}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}{s.issued_by_name ? ` · recorded by ${s.issued_by_name}` : ''}</span>
                            <ul className="ml-5 list-disc text-xs text-slate-600">{s.lines.map(l => <li key={l.id}>{l.label}: {qty(l.qty)} {l.uom}{l.returned ? ` · ${qty(l.returned)} back` : ''}{l.rolls?.length ? ` — ${l.rolls.map(x => `roll ${x.roll_no} ${qty(x.qty)}`).join(', ')}` : ''}</li>)}</ul>
                        </div>
                    ))}
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-4">
                    <p className="font-bold text-slate-800 mb-2">History</p>
                    <div className="divide-y divide-slate-100 text-sm max-h-[420px] overflow-y-auto">
                        {r.history.map(h => (
                            <div key={h.id} className="py-1.5"><span className="text-xs text-slate-400 mr-2">{new Date(h.created_at).toLocaleString('en-IN')}</span><b>{ACTION[h.action] || h.action}</b>{h.user_name ? <span className="text-slate-600"> · {h.user_name}</span> : null}{h.reason ? <span className="text-slate-500"> — {h.reason}</span> : null}
                                {h.detail?.summary?.length > 0 && <ul className="ml-6 list-disc text-xs text-slate-600">{h.detail.summary.map((x, i) => <li key={i}>{x}</li>)}</ul>}</div>
                        ))}
                    </div>
                </div>
            </div>

            {issue && (
                <Modal title={`Fabric for ${r.request_no}`} onClose={() => setIssue(null)}>
                    <div className="space-y-3 w-[min(900px,94vw)] max-h-[80vh] overflow-y-auto">
                        <p className="text-sm text-slate-600">Enter the metres you cut off each roll. Free rolls first; a roll {r.order_no} holds for bulk only with a reason (its allocation shrinks). Rolls other orders hold are not offered.</p>
                        {issue.fabrics.map(f => (
                            <div key={f.id} className="border border-slate-200 rounded-lg overflow-hidden">
                                <div className="flex flex-wrap items-baseline gap-x-3 px-3 py-2 bg-slate-50 text-sm"><b>{f.label}</b><span className="text-slate-600">to issue <b>{qty(f.to_issue)} {f.uom}</b></span>
                                    <span className={`ml-auto text-xs font-bold ${issueSum(f) > f.to_issue + 1e-9 ? 'text-rose-700' : 'text-emerald-700'}`}>cutting {qty(issueSum(f))} {f.uom}</span></div>
                                {f.rolls.length === 0 ? <p className="px-3 py-2 text-sm text-rose-700">No roll of this fabric can be cut{f.held_elsewhere ? ` (${f.held_elsewhere} held by other orders)` : ''}.</p> : (
                                    <table className="w-full text-sm">
                                        <thead className="text-xs font-bold text-slate-500 text-left"><tr><th className="px-3 py-1">Roll</th><th className="px-3 py-1">Dye lot</th><th className="px-3 py-1 text-right">In stock</th><th className="px-3 py-1">Held</th><th className="px-3 py-1 text-right">Cut for the sample</th></tr></thead>
                                        <tbody>{f.rolls.map(x => {
                                            const v = issue.picks.get(x.id) || ''; const bad = Number(v) > x.left + 1e-9;
                                            return (
                                                <tr key={x.id} className={`border-t border-slate-100 ${x.own ? 'bg-amber-50/50' : ''}`}>
                                                    <td className="px-3 py-1 font-semibold">{x.roll_no}</td><td className="px-3 py-1">{x.dye_lot || '—'}</td>
                                                    <td className="px-3 py-1 text-right tabular-nums">{qty(x.left)} {f.uom}</td>
                                                    <td className="px-3 py-1 text-xs">{x.own ? <b className="text-amber-800">{r.order_no} (bulk)</b> : <span className="text-emerald-700">free</span>}</td>
                                                    <td className="px-3 py-1 text-right"><input className={`w-24 px-2 py-1 text-right border rounded ${bad ? 'border-rose-400' : 'border-slate-300'}`} type="number" min="0" step="0.01" value={v} onChange={e => setIssue({ ...issue, picks: new Map(issue.picks).set(x.id, e.target.value) })} aria-label={`Metres off ${x.roll_no}`} /> <span className="text-xs text-slate-500">{f.uom}</span></td>
                                                </tr>
                                            );
                                        })}</tbody>
                                    </table>
                                )}
                            </div>
                        ))}
                        {usesOwn && <Field label={`Why cut it off ${r.order_no}'s own roll *`}><input className={inputCls} value={issue.own_reason} onChange={e => setIssue({ ...issue, own_reason: e.target.value })} placeholder="e.g. no free roll of this shade" /></Field>}
                        <div className="grid sm:grid-cols-2 gap-3">
                            <Field label="Taken by (sampling) *"><input className={inputCls} value={issue.name} onChange={e => setIssue({ ...issue, name: e.target.value })} placeholder="Name of the person in sampling" /></Field>
                            <Field label="Note"><input className={inputCls} value={issue.note} onChange={e => setIssue({ ...issue, note: e.target.value })} /></Field>
                        </div>
                        <p className="text-xs text-slate-500">Recorded by you — sampling does not sign in 3.0 yet. The slip prints with a signature box.</p>
                        <ErrorBox text={formError} />
                        <div className="flex justify-end gap-2"><SecondaryButton onClick={() => setIssue(null)}>Back</SecondaryButton>
                            <PrimaryButton busy={busy} disabled={busy || !issueOk} onClick={() => run(() => samplesApi.fabricIssue(id, { received_by_name: issue.name.trim(), note: issue.note.trim() || null, own_roll_reason: issue.own_reason.trim() || null,
                                rolls: [...issue.picks.entries()].filter(([, v]) => Number(v) > 0).map(([roll_id, v]) => ({ roll_id, qty: Number(v) })) }), () => setIssue(null))}><Scissors size={14} /> Hand over to sampling</PrimaryButton></div>
                    </div>
                </Modal>
            )}
            {ret && (
                <Modal title={`What came back — ${r.request_no}`} onClose={() => setRet(null)}>
                    <div className="space-y-3 w-[min(760px,92vw)] max-h-[80vh] overflow-y-auto">
                        <p className="text-sm text-slate-600">Trims go back to free stock; fabric goes back onto the roll it was cut from. {perm.trims && !perm.fabric ? 'You record trims.' : perm.fabric && !perm.trims ? 'You record fabric.' : ''}</p>
                        <table className="w-full text-sm">
                            <thead className="text-xs font-bold text-slate-500 text-left"><tr><th className="py-1">Slip</th><th className="py-1">Item</th><th className="py-1 text-right">Out</th><th className="py-1 text-right">Back now</th></tr></thead>
                            <tbody>{returnable.map(l => { const out = Math.round((l.qty - l.returned) * 1000) / 1000; const v = ret.lines.get(l.id) || ''; return (
                                <tr key={l.id} className="border-t border-slate-100"><td className="py-1 text-xs">{l.slip.issue_no}</td><td className="py-1">{l.label}</td><td className="py-1 text-right tabular-nums">{qty(out)} {l.uom}</td>
                                    <td className="py-1 text-right"><input className={`w-24 px-2 py-1 text-right border rounded ${Number(v) > out + 1e-9 ? 'border-rose-400' : 'border-slate-300'}`} type="number" min="0" step="any" value={v} onChange={e => setRet({ ...ret, lines: new Map(ret.lines).set(l.id, e.target.value) })} /></td></tr>
                            ); })}</tbody>
                        </table>
                        <Field label="What came back and why *"><input className={inputCls} value={ret.reason} onChange={e => setRet({ ...ret, reason: e.target.value })} placeholder="e.g. sample done, offcut back" /></Field>
                        <ErrorBox text={formError} />
                        <div className="flex justify-end gap-2"><SecondaryButton onClick={() => setRet(null)}>Back</SecondaryButton>
                            <PrimaryButton busy={busy} disabled={busy || !ret.reason.trim() || ![...ret.lines.values()].some(v => Number(v) > 0)} onClick={() => run(() => samplesApi.returns(id, { reason: ret.reason.trim(), lines: [...ret.lines.entries()].filter(([, v]) => Number(v) > 0).map(([issue_line_id, v]) => ({ issue_line_id, qty: Number(v) })) }), () => setRet(null))}><Undo2 size={14} /> Record</PrimaryButton></div>
                    </div>
                </Modal>
            )}
            {fline && (
                <Modal title={`Change — ${fline.line.label}`} onClose={() => setFline(null)}>
                    <div className="space-y-3 w-[min(480px,90vw)]">
                        <p className="text-sm text-slate-600">BOM gives {qty(fline.line.bom_qty)} {fline.line.uom}; {qty(fline.line.net)} {fline.line.uom} is with sampling.</p>
                        <Field label={`Needed (${fline.line.uom}) *`}><input className={inputCls} type="number" min="0" step="0.01" value={fline.qty} onChange={e => setFline({ ...fline, qty: e.target.value })} /></Field>
                        <Field label="Reason *"><input className={inputCls} value={fline.reason} onChange={e => setFline({ ...fline, reason: e.target.value })} placeholder="e.g. one panel re-cut" /></Field>
                        <ErrorBox text={formError} />
                        <div className="flex justify-end gap-2"><SecondaryButton onClick={() => setFline(null)}>Back</SecondaryButton>
                            <PrimaryButton busy={busy} disabled={busy || fline.qty === '' || !fline.reason.trim()} onClick={() => run(() => samplesApi.fabricLine(id, fline.line.id, { qty: Number(fline.qty), reason: fline.reason.trim() }), () => setFline(null))}>Save</PrimaryButton></div>
                    </div>
                </Modal>
            )}
            {ask && <AskModal ask={ask} askText={askText} setAskText={setAskText} busy={busy} formError={formError} onClose={() => setAsk(null)} onRun={() => run(() => ask.run(askText.trim()), () => setAsk(null))} />}
        </div>
    );
}

function AskModal({ ask, askText, setAskText, busy, formError, onClose, onRun }) {
    return (
        <Modal title={ask.title} onClose={onClose}>
            <div className="space-y-3 w-[min(440px,85vw)]">
                {ask.hint && <p className="text-sm text-slate-600">{ask.hint}</p>}
                <Field label={`${ask.label || 'Reason'} *`}><textarea className={`${inputCls} min-h-[80px]`} value={askText} onChange={e => setAskText(e.target.value)} autoFocus /></Field>
                <ErrorBox text={formError} />
                <div className="flex justify-end gap-2"><SecondaryButton onClick={onClose}>Back</SecondaryButton><PrimaryButton onClick={onRun} busy={busy} disabled={busy || !askText.trim()}>{ask.confirm}</PrimaryButton></div>
            </div>
        </Modal>
    );
}

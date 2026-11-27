// One trim kit — /v3/trim-kits/:kitId (26 Nov 2026; owner: "on click it divert to /v3/trim-orders/32?kit=92 which is wrong
// it must open trim kit details page where user tap each line items as received group line items by type and sorted as we
// are sorting in kit pdf" · "loader might reject 1 or more item and confirm kit rejected items goes back to store with
// notification" · "yes build for partial reject also"). The line loader's screen, tablet first (like 2.0's floor screens):
// the kit's items in the pick list's order (issue stage → trim type → line no.), a heading per trim type; tap a line = taken
// in full; Reject = take part or none of it, with why (wrong item / damaged / short — not in the bag / other). Confirm signs
// the kit: what is taken is issued (one TI slip + one TB bill), what is rejected stays owed on the trim order and goes back
// to the store (migration 92: a return the store confirms — or auto-confirmed, Settings). The store sees the same page read-only.
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Check, X, RotateCcw, FileDown, PenLine } from 'lucide-react';
import Modal from '../../shared/Modal';
import { trimKitsApi } from '../api/trimKitsApi';
import { apiError } from '../api/mastersApi';
import { useV3Live } from '../live';
import { Field, inputCls, PrimaryButton, SecondaryButton, ErrorBox, Loading } from '../components/ui';
import { loadLetterhead } from '../components/letterhead';
import { KIT_STATE, REJECT_REASON, qty, groupKitLines, byStage, stageKey, stageName, spread } from './trimKitShared';
import { exportPickList } from './kitPrint';
import KitReturns from './KitReturns';
import ItemFilter, { itemMatcher } from './ItemFilter';

const r3 = (n) => Math.round(Number(n) * 1000) / 1000;
const when = (d) => (d ? new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');

export default function TrimKitDetailPage() {
    const { kitId } = useParams();
    const [kit, setKit] = useState(null);
    const [k, setK] = useState(null);           // the kit's trim order (lines, kits, handovers, returns)
    const [perm, setPerm] = useState({ prepare: false, sign: false });
    const [lines, setLines] = useState([]);     // production lines the kit can go to
    const [marks, setMarks] = useState({});     // group key → { state: 'ok' | 'reject', got, reason, note }
    const [lineId, setLineId] = useState('');
    const [reject, setReject] = useState(null); // the row being rejected: { g, got, reason, note }
    const [confirm, setConfirm] = useState(null); // { note }
    const [sendBack, setSendBack] = useState(null); // { reason }
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [formError, setFormError] = useState('');
    const [fq, setFq] = useState('');           // item search (26 Nov 2026)
    const [ftype, setFtype] = useState('');     // trim type filter

    const load = useCallback(async () => {
        try {
            const t = (await trimKitsApi.kit(kitId)).data;
            const o = (await trimKitsApi.get(t.trim_order_id)).data;
            setKit(o.kits.find(x => x.id === String(kitId)) || t); setK(o);
            setLineId(cur => cur || t.production_line_id || (o.batch_lines?.length === 1 ? o.batch_lines[0].id : ''));
        } catch (err) { setError(apiError(err, 'Failed to load the kit.')); }
    }, [kitId]);
    useEffect(() => { load(); trimKitsApi.permissions().then(r => setPerm(r.data)).catch(() => {}); trimKitsApi.lines().then(r => setLines(r.data)).catch(() => {}); }, [load]);
    useV3Live(() => { if (!confirm && !reject && !busy) load(); });

    if (!kit || !k) return error ? <ErrorBox text={error} /> : <Loading />;

    const lineOf = new Map(k.lines.map(l => [l.id, l]));
    const groups = byStage(groupKitLines(kit.lines.map(kl => ({ ...lineOf.get(kl.order_line_id), picked: kl.qty, picked_units: kl.units }))));
    // headings: one per trim type, in the pick list's order (stage → trim type → line no.); search / trim type narrow them
    const filtering = Boolean(fq.trim() || ftype);
    const match = itemMatcher(fq, ftype);
    const itemTypes = [...new Set(groups.map(g => g.type_name).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    const sections = [];
    for (const g of groups.filter(match)) {
        const key = `${stageKey(g)}|${g.type_name || ''}`;
        if (!sections.length || sections[sections.length - 1].key !== key) sections.push({ key, type: g.type_name || 'Other', stage: stageName(g), rows: [] });
        sections[sections.length - 1].rows.push(g);
    }
    const unit = (g) => (g.in_units ? g.purchase_uom : g.uom);
    const inKit = (g) => (g.in_units ? g.lines.reduce((a, l) => a + (l.picked_units || 0), 0) : r3(g.lines.reduce((a, l) => a + l.picked, 0)));
    const amount = (g, v) => (g.in_units ? `${v} ${g.purchase_uom} = ${qty(r3(Math.min(g.lines.reduce((a, l) => a + l.picked, 0), v * g.factor)), g.uom)} ${g.uom}` : `${qty(v, g.uom)} ${g.uom}`);
    const LAB = kit.labels_qty > 0 ? { key: 'labels', label: 'Garment barcode labels', labels: true } : null;
    const keys = [...groups.map(g => g.key), ...(LAB ? ['labels'] : [])];
    const mark = (key) => marks[key];
    const nOk = keys.filter(x => mark(x)?.state === 'ok').length;
    const nRej = keys.filter(x => mark(x)?.state === 'reject').length;
    const nTodo = keys.length - nOk - nRej;
    const canSign = perm.sign && kit.status === 'READY' && k.kind !== 'SAMPLE';
    const signedLines = kit.status === 'SIGNED' ? (k.handovers.find(h => h.id === kit.handover_id)?.lines || []) : [];
    const returns = (k.returns || []).filter(r => r.kit_id === String(kit.id));
    const st = KIT_STATE[kit.status] || KIT_STATE.PREPARING;
    const tap = (key) => { if (!canSign) return; setMarks(m => ({ ...m, [key]: m[key]?.state === 'ok' ? undefined : { state: 'ok' } })); };
    const allOk = () => setMarks(m => Object.fromEntries(keys.map(x => [x, m[x]?.state === 'reject' ? m[x] : { state: 'ok' }])));
    const openReject = (g) => { setFormError(''); const cur = mark(g.key); setReject({ g, got: cur?.state === 'reject' ? String(cur.got) : '0', reason: cur?.reason || '', note: cur?.note || '' }); };
    const rejMax = reject ? (reject.g.labels ? kit.labels_qty : inKit(reject.g)) : 0;
    const rejGot = reject ? Number(reject.got || 0) : 0;
    const rejBad = reject && (reject.got === '' || !(rejGot >= 0) || rejGot >= rejMax - 1e-9 || ((reject.g.labels || reject.g.in_units || reject.g.uom === 'pcs') && !Number.isInteger(rejGot))
        || (!reject.g.labels && !reject.reason) || (reject.reason === 'OTHER' && !reject.note.trim()));
    const saveReject = () => { setMarks(m => ({ ...m, [reject.g.key]: { state: 'reject', got: rejGot, reason: reject.reason, note: reject.note.trim() } })); setReject(null); };

    // one number per item, spread over its lines (order first); a line not taken in full carries the reject reason
    const payload = (note) => ({
        production_line_id: lineId || undefined, note: note || undefined,
        lines: groups.flatMap(g => {
            const m = mark(g.key); const key = g.in_units ? 'units' : 'qty';
            const caps = g.lines.map(l => (g.in_units ? l.picked_units || 0 : l.picked));
            if (m.state === 'ok') return g.lines.map((l, i) => ({ order_line_id: l.id, [key]: caps[i] }));
            const shares = spread(m.got, caps);
            return g.lines.map((l, i) => (shares[i] + 1e-9 < caps[i]
                ? { order_line_id: l.id, [key]: shares[i], reject_reason: m.reason, note: m.note || undefined }
                : { order_line_id: l.id, [key]: caps[i] }));
        }),
        ...(LAB ? { labels: { counted: mark('labels').state === 'ok' ? kit.labels_qty : mark('labels').got, note: mark('labels').note || undefined } } : {}),
    });
    const sign = async () => {
        setBusy(true); setFormError('');
        try { await trimKitsApi.kitSign(kit.id, payload(confirm.note.trim())); setConfirm(null); setMarks({}); await load(); window.scrollTo(0, 0); }
        catch (err) { setFormError(apiError(err, 'Failed to sign.')); } finally { setBusy(false); }
    };
    const doSendBack = async () => {
        setBusy(true); setFormError('');
        try { await trimKitsApi.kitSendBack(kit.id, sendBack.reason.trim()); setSendBack(null); await load(); }
        catch (err) { setFormError(apiError(err, 'Failed.')); } finally { setBusy(false); }
    };
    const signedOf = (g) => { const v = r3(signedLines.filter(x => g.lines.some(l => l.id === x.order_line_id)).reduce((a, x) => a + x.qty, 0)); return v; };
    const rejectedOf = (g) => returns.filter(r => g.lines.some(l => l.id === r.order_line_id));

    const Row = ({ g }) => {
        const m = mark(g.key); const isLab = Boolean(g.labels);
        const total = isLab ? kit.labels_qty : inKit(g);
        const tone = m?.state === 'ok' ? 'border-emerald-400 bg-emerald-50' : m?.state === 'reject' ? 'border-rose-400 bg-rose-50' : 'border-slate-200 bg-white';
        const rj = !isLab && kit.status === 'SIGNED' ? rejectedOf(g) : [];
        return (
            <div role={canSign ? 'button' : undefined} tabIndex={canSign ? 0 : undefined} onClick={() => tap(g.key)} onKeyDown={e => { if (canSign && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); tap(g.key); } }}
                className={`flex items-center gap-3 rounded-xl border-2 px-3 py-3 min-h-[64px] ${tone} ${canSign ? 'cursor-pointer select-none active:scale-[0.995]' : ''}`}>
                <span className={`shrink-0 w-9 h-9 rounded-full border-2 flex items-center justify-center ${m?.state === 'ok' ? 'bg-emerald-600 border-emerald-600 text-white' : m?.state === 'reject' ? 'bg-rose-600 border-rose-600 text-white' : 'border-slate-300 text-slate-300'}`}>
                    {m?.state === 'reject' ? <X size={20} /> : <Check size={20} />}
                </span>
                <span className="shrink-0 w-8 text-sm tabular-nums text-slate-500">{isLab ? 'L' : g.line_no}</span>
                <span className="min-w-0 flex-1">
                    <span className="block font-bold text-slate-900 leading-snug">{isLab ? 'Garment barcode labels' : g.label}</span>
                    {m?.state === 'reject' && <span className="block text-sm font-semibold text-rose-800">Took {isLab ? `${m.got} pcs` : amount(g, m.got)} · rejected {isLab ? `${total - m.got} pcs` : amount(g, r3(total - m.got))}{m.reason ? ` — ${REJECT_REASON[m.reason]}` : ''}{m.note ? ` (${m.note})` : ''}</span>}
                    {kit.status === 'SIGNED' && !isLab && <span className="block text-sm text-slate-600">Signed {qty(signedOf(g), g.uom)} {g.uom}{rj.length ? <b className="text-rose-700"> · rejected {rj.map(r => `${qty(r.qty, r.uom)} ${r.uom} (${REJECT_REASON[r.reason]})`).join(', ')}</b> : ''}</span>}
                </span>
                <span className="shrink-0 text-right">
                    <span className="block text-lg font-black tabular-nums text-slate-900 whitespace-nowrap">{isLab ? `${total} pcs` : amount(g, total)}</span>
                    {!isLab && g.lines.length > 1 && <span className="block text-[11px] text-sky-700">order + over-cut</span>}
                </span>
                {canSign && (
                    <button type="button" onClick={e => { e.stopPropagation(); openReject(g); }} className="shrink-0 ml-1 px-3 py-2 rounded-lg border-2 border-rose-300 text-rose-800 text-sm font-bold bg-white hover:bg-rose-50">Reject</button>
                )}
            </div>
        );
    };

    return (
        <div className="max-w-5xl mx-auto pb-28">
            <Link to={`/v3/trim-orders?tab=kits:${kit.status === 'READY' ? 'READY' : kit.status}`} className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-indigo-600 mb-3"><ArrowLeft size={15} /> Kits</Link>
            {/* The kit's banner (27 Nov 2026, owner: "complete data in below banner is messed up" → labelled fields, like 2.0's
                floor screens): each fact under its own small label; the line the kit goes to is the banner's own drop-down. */}
            {(() => {
                const h = kit.status === 'SIGNED' ? k.handovers.find(x => x.id === kit.handover_id) : null;
                const lineBatch = k.batch_code && k.order_no && k.batch_code.startsWith(`${k.order_no}-`) ? k.batch_code.slice(k.order_no.length + 1).replace('-', ' · ') : k.batch_code;
                const checked = keys.filter(x => mark(x)).length;
                const F = ({ label, children, wide }) => (
                    <div className={`min-w-0 ${wide ? 'col-span-2 sm:col-span-1' : ''}`}>
                        <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</p>
                        <div className="text-sm text-slate-800 leading-snug">{children}</div>
                    </div>
                );
                const when2 = (d, who) => <>{when(d)}{who ? <span className="block text-xs text-slate-500">{who}</span> : null}</>;
                return (
                    <div className="bg-white border-2 border-slate-800 rounded-xl mb-3 overflow-hidden">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 pt-3 pb-2 border-b border-slate-100">
                            <h1 className="text-3xl font-black tracking-tight text-slate-900">{kit.kit_no}</h1>
                            <span className={`text-xs font-black px-2 py-0.5 rounded border ${st.cls}`}>{st.label}</span>
                            {canSign && <span className={`ml-auto text-sm font-bold ${checked === keys.length ? 'text-emerald-700' : 'text-slate-600'}`}>{checked} of {keys.length} checked</span>}
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-5 gap-y-3 px-4 py-3">
                            <F label="Order"><b>{k.order_no}</b><span className="block text-xs text-slate-500">{k.customer_name}</span></F>
                            <F label="Batch">{k.floor_no ? <b className="text-base">#{k.floor_no}</b> : '—'}{lineBatch && <span className="block text-xs text-slate-500">{lineBatch}</span>}</F>
                            <F label="Stages">{kit.stages?.length ? kit.stages.join(' · ') : <span className="text-slate-400">no stage</span>}</F>
                            <F label="Goes to">{canSign ? (
                                <select className="w-full px-2 py-1.5 text-sm font-bold border border-slate-300 rounded-lg bg-white focus:outline-none focus:border-indigo-500" value={lineId} onChange={e => setLineId(e.target.value)} aria-label="Goes to (line)">
                                    <option value="">— pick the line —</option>
                                    {(() => { const mine = new Set((k.batch_lines || []).map(l => l.id)); return [...lines.filter(l => mine.has(l.id)), ...lines.filter(l => !mine.has(l.id))]; })()
                                        .map(l => <option key={`${l.id}-${l.stage || ''}`} value={l.id}>{l.name}{l.stage ? ` (${l.stage})` : ''}{(k.batch_lines || []).some(b => b.id === l.id) ? ' — batch is here' : ''}</option>)}
                                </select>) : <b>{h?.production_line_name || kit.goes_to || <span className="font-normal text-slate-400">any line</span>}</b>}
                                {canSign && lineId && (k.batch_lines || []).some(b => b.id === lineId) && <span className="block text-xs text-emerald-700">batch is here</span>}
                                {canSign && !lineId && <span className="block text-xs font-bold text-amber-700">pick the line</span>}</F>
                            <F label="Items">{groups.length}{kit.labels_qty ? <span className="block text-xs text-slate-500">+ {kit.labels_qty} garment labels</span> : <span className="block text-xs text-slate-500">no garment labels</span>}</F>
                            {kit.status === 'SIGNED' ? (
                                <F label="Signed">{when2(kit.signed_at, h ? `${h.signed_by_name || '—'}${h.production_line_name ? ` · ${h.production_line_name}` : ''}` : null)}</F>
                            ) : kit.status === 'READY' ? (
                                <F label="Ready">{when2(kit.ready_at, kit.ready_by_name)}</F>
                            ) : kit.status === 'CANCELLED' ? (
                                <F label="Cancelled">{when2(kit.cancelled_at, kit.cancelled_by_name)}</F>
                            ) : (
                                <F label="Made">{when2(kit.created_at, kit.created_by_name)}</F>
                            )}
                            {kit.status === 'SIGNED' && h && <F label="Slip · bill">{h.issue_id ? <Link to={`/v3/trim-orders/slips/${h.issue_id}`} className="font-bold text-indigo-700 hover:underline">{h.issue_no}</Link> : 'garment labels only'}{kit.bill_no ? <span className="block text-xs text-slate-500">bill {kit.bill_no}</span> : null}</F>}
                            <F label="Trim order"><Link to={`/v3/trim-orders/${k.id}`} className="font-semibold text-indigo-700 hover:underline">{k.trim_order_no} ›</Link></F>
                        </div>
                        {kit.notes && <p className="px-4 pb-3 -mt-1 text-sm text-slate-600"><span className="text-[10px] font-black uppercase tracking-wider text-slate-400 mr-2">Note</span>{kit.notes}</p>}
                        {kit.status === 'PREPARING' && <p className="px-4 py-2 text-sm bg-slate-50 border-t border-slate-200 text-slate-700">The store is still preparing this kit — it can be signed once it is marked ready.</p>}
                        {kit.status === 'PREPARING' && kit.sent_back_reason && <p className="px-4 py-2 text-sm bg-rose-50 border-t border-rose-200 text-rose-900"><b>Sent back:</b> {kit.sent_back_reason}</p>}
                        {kit.status === 'CANCELLED' && <p className="px-4 py-2 text-sm bg-slate-50 border-t border-slate-200 text-slate-600"><b>Cancelled:</b> {kit.cancelled_reason}</p>}
                        {kit.status === 'READY' && k.kind === 'SAMPLE' && <p className="px-4 py-2 text-sm bg-slate-50 border-t border-slate-200 text-slate-600">A sample's kit — the trim store hands it over to sampling.</p>}
                        {kit.status === 'READY' && !perm.sign && k.kind !== 'SAMPLE' && <p className="px-4 py-2 text-sm bg-slate-50 border-t border-slate-200 text-slate-600">Waiting for a line loader to sign for it.</p>}
                        {kit.status === 'SIGNED' && returns.length > 0 && <p className="px-4 py-2 text-sm bg-rose-50 border-t border-rose-200 text-rose-900"><b>{returns.length} line(s) rejected</b> — back to the store (below).</p>}
                    </div>
                );
            })()}
            <ErrorBox text={error} />

            {/* one toolbar: the actions on the left, the search and trim type on the right */}
            <div className="flex flex-wrap items-center gap-2 mb-2">
                {canSign && <>
                    <SecondaryButton onClick={allOk}><Check size={14} /> All received</SecondaryButton>
                    <SecondaryButton onClick={() => setMarks({})}>Clear</SecondaryButton>
                    <SecondaryButton onClick={() => { setFormError(''); setSendBack({ reason: '' }); }}><RotateCcw size={14} /> Send whole kit back</SecondaryButton>
                </>}
                {['PREPARING', 'READY'].includes(kit.status) && <SecondaryButton onClick={async () => exportPickList(k, await loadLetterhead(), kit)}><FileDown size={14} /> Pick list</SecondaryButton>}
                <div className="xl:ml-auto [&>div]:mb-0"><ItemFilter q={fq} setQ={setFq} type={ftype} setType={setFtype} types={itemTypes} shown={groups.filter(match).length} total={groups.length} big /></div>
            </div>
            {canSign && <p className="mb-3 text-sm text-slate-500">Tap each item you find in the bag. Wrong, damaged or missing → <b>Reject</b> (all or part) — it goes back to the store.</p>}
            {filtering && canSign && <p className="-mt-1 mb-3 text-sm text-amber-800">Filtered — the other items are hidden, not skipped: every item still needs a tick or a reject before Confirm.</p>}
            <div className="space-y-4">
                {filtering && !sections.length && <p className="text-sm text-slate-500 bg-white border border-slate-200 rounded-xl p-6 text-center">No item in this kit matches.</p>}
                {sections.map(sec => (
                    <div key={sec.key}>
                        <div className="flex items-baseline gap-2 mb-1.5 px-1">
                            <h2 className="text-base font-black uppercase tracking-wider text-slate-800">{sec.type}</h2>
                            <span className="text-xs text-slate-500">{sec.stage} · {sec.rows.length} item{sec.rows.length === 1 ? '' : 's'}{canSign ? ` · ${sec.rows.filter(g => mark(g.key)).length} checked` : ''}</span>
                        </div>
                        <div className="space-y-2">{sec.rows.map(g => <Row key={g.key} g={g} />)}</div>
                    </div>
                ))}
                {LAB && !filtering && (
                    <div>
                        <div className="flex items-baseline gap-2 mb-1.5 px-1"><h2 className="text-base font-black uppercase tracking-wider text-slate-800">Labels</h2><span className="text-xs text-slate-500">printed by the store</span></div>
                        <Row g={LAB} />
                    </div>
                )}
            </div>

            {returns.length > 0 && (
                <div className="mt-5 bg-white border border-rose-200 rounded-xl overflow-hidden">
                    <p className="px-4 py-2.5 font-bold text-slate-800 bg-rose-50/60 border-b border-rose-100">Rejected — back to the store</p>
                    <KitReturns rows={returns} canConfirm={Boolean(perm.prepare)} onDone={load} />
                </div>
            )}

            {canSign && (
                <div className="fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur border-t-2 border-slate-200 px-4 py-3">
                    <div className="max-w-5xl mx-auto flex flex-wrap items-center gap-x-4 gap-y-2">
                        <span className="text-base"><b className="text-emerald-700">{nOk} received</b> · <b className="text-rose-700">{nRej} rejected</b> · <b className={nTodo ? 'text-amber-700' : 'text-slate-400'}>{nTodo} to check</b> <span className="text-slate-400">of {keys.length}</span></span>
                        <span className="ml-auto" />
                        {!lineId && <span className="text-sm font-semibold text-amber-700">pick the line</span>}
                        <PrimaryButton disabled={nTodo > 0 || !lineId || busy} onClick={() => { setFormError(''); setConfirm({ note: '' }); }}><PenLine size={16} /> Confirm kit</PrimaryButton>
                    </div>
                </div>
            )}

            {reject && (
                <Modal title={`Reject — ${reject.g.labels ? 'garment labels' : reject.g.label}`} onClose={() => setReject(null)}>
                    <div className="space-y-4">
                        <p className="text-sm text-slate-700">In the kit: <b>{reject.g.labels ? `${kit.labels_qty} pcs` : amount(reject.g, rejMax)}</b>. How many do you take? The rest goes back to the store.</p>
                        <div className="flex flex-wrap items-center gap-2">
                            <input type="number" min="0" max={rejMax} step={reject.g.labels || reject.g.in_units || reject.g.uom === 'pcs' ? 1 : 'any'} inputMode="decimal"
                                className={`w-40 px-3 py-2.5 text-xl text-right border-2 rounded-lg ${rejBad && reject.got !== '' && rejGot >= rejMax ? 'border-rose-400' : 'border-slate-300'}`}
                                value={reject.got} onChange={e => setReject({ ...reject, got: e.target.value })} aria-label="Taken" autoFocus />
                            <span className="text-base text-slate-600">{reject.g.labels ? 'pcs' : unit(reject.g)} taken</span>
                            <button type="button" className="px-3 py-2 rounded-lg border border-slate-300 text-sm font-bold" onClick={() => setReject({ ...reject, got: '0' })}>None — reject all</button>
                            {reject.got !== '' && rejGot < rejMax && <span className="text-base font-bold text-rose-700">rejected {reject.g.labels ? `${rejMax - rejGot} pcs` : `${r3(rejMax - rejGot)} ${unit(reject.g)}`}</span>}
                        </div>
                        {rejGot >= rejMax && reject.got !== '' && <p className="text-sm text-rose-700">Taking all of it is not a reject — close this and tap the line.</p>}
                        {!reject.g.labels && (
                            <div>
                                <p className="text-sm font-bold text-slate-700 mb-1.5">Why?</p>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                    {Object.entries(REJECT_REASON).map(([code, label]) => (
                                        <button key={code} type="button" onClick={() => setReject({ ...reject, reason: code })}
                                            className={`px-3 py-3 rounded-lg border-2 text-sm font-bold ${reject.reason === code ? 'border-rose-500 bg-rose-50 text-rose-800' : 'border-slate-200 bg-white text-slate-700'}`}>{label}</button>
                                    ))}
                                </div>
                            </div>
                        )}
                        <Field label={reject.reason === 'OTHER' ? 'What is wrong' : 'Note (optional)'}><input className={inputCls} value={reject.note} onChange={e => setReject({ ...reject, note: e.target.value })} placeholder={reject.reason === 'WRONG_ITEM' ? 'what was in the bag instead' : ''} /></Field>
                        <div className="flex justify-end gap-2">
                            {mark(reject.g.key)?.state === 'reject' && <SecondaryButton onClick={() => { setMarks(m => ({ ...m, [reject.g.key]: undefined })); setReject(null); }}>Undo reject</SecondaryButton>}
                            <SecondaryButton onClick={() => setReject(null)}>Back</SecondaryButton>
                            <PrimaryButton disabled={rejBad} onClick={saveReject}><X size={14} /> Reject</PrimaryButton>
                        </div>
                    </div>
                </Modal>
            )}

            {confirm && (
                <Modal title={`Confirm ${kit.kit_no}`} onClose={() => setConfirm(null)}>
                    <div className="space-y-3">
                        <p className="text-base text-slate-800">You take <b className="text-emerald-700">{nOk + keys.filter(x => mark(x)?.state === 'reject' && mark(x).got > 0).length} item(s)</b> for <b>{lines.find(l => l.id === lineId)?.name || 'the line'}</b> — they are issued to the line on one trim slip.</p>
                        {nRej > 0 && (
                            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">
                                <p className="font-bold mb-1">{nRej} rejected — goes back to the store (the store is told):</p>
                                <ul className="list-disc ml-5">{keys.filter(x => mark(x)?.state === 'reject').map(x => {
                                    const g = x === 'labels' ? LAB : groups.find(y => y.key === x); const m = mark(x); const total = x === 'labels' ? kit.labels_qty : inKit(g);
                                    return <li key={x}>{x === 'labels' ? 'Garment labels' : g.label}: {x === 'labels' ? `${total - m.got} pcs` : amount(g, r3(total - m.got))}{m.reason ? ` — ${REJECT_REASON[m.reason]}` : ''}{m.note ? ` (${m.note})` : ''}</li>;
                                })}</ul>
                                <p className="mt-1 text-xs">They stay owed on the trim order — the store puts them in another kit.</p>
                            </div>
                        )}
                        <Field label="Note (optional)"><input className={inputCls} value={confirm.note} onChange={e => setConfirm({ note: e.target.value })} /></Field>
                        <ErrorBox text={formError} />
                        <div className="flex justify-end gap-2">
                            <SecondaryButton onClick={() => setConfirm(null)}>Back</SecondaryButton>
                            <PrimaryButton busy={busy} disabled={busy} onClick={sign}><PenLine size={14} /> Sign for the kit</PrimaryButton>
                        </div>
                    </div>
                </Modal>
            )}

            {sendBack && (
                <Modal title={`Send ${kit.kit_no} back to the store`} onClose={() => setSendBack(null)}>
                    <div className="space-y-3">
                        <p className="text-sm text-slate-600">The whole bag goes back and nothing is signed. For one wrong or damaged item, reject just that item instead — the rest is signed.</p>
                        <Field label="What is wrong with the kit"><input className={inputCls} value={sendBack.reason} onChange={e => setSendBack({ reason: e.target.value })} autoFocus /></Field>
                        <ErrorBox text={formError} />
                        <div className="flex justify-end gap-2">
                            <SecondaryButton onClick={() => setSendBack(null)}>Back</SecondaryButton>
                            <PrimaryButton busy={busy} disabled={busy || !sendBack.reason.trim()} onClick={doSendBack}><RotateCcw size={14} /> Send back</PrimaryButton>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
}

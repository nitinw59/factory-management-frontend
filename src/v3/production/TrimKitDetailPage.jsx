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
    // headings: one per trim type, in the pick list's order (stage → trim type → line no.)
    const sections = [];
    for (const g of groups) {
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
            <div className="bg-white border-2 border-slate-800 rounded-xl px-4 py-3 mb-3">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <h1 className="text-3xl font-black tracking-tight text-slate-900">{kit.kit_no}</h1>
                    <span className={`text-xs font-black px-2 py-0.5 rounded border ${st.cls}`}>{st.label}</span>
                    <span className="ml-auto text-sm text-slate-500">{kit.status === 'READY' ? `ready ${when(kit.ready_at)}${kit.ready_by_name ? ` · ${kit.ready_by_name}` : ''}` : kit.status === 'SIGNED' ? `signed ${when(kit.signed_at)}` : `made ${when(kit.created_at)}`}</span>
                </div>
                <p className="text-sm text-slate-700 mt-1">
                    <Link to={`/v3/trim-orders/${k.id}`} className="font-bold text-indigo-700 hover:underline">{k.trim_order_no}</Link> · {k.order_no}{k.floor_no ? <> · batch <b>#{k.floor_no}</b></> : ''} · {k.customer_name}
                </p>
                <p className="text-sm text-slate-700">{kit.stages?.length ? kit.stages.join(', ') : 'no stage'} → <b>{kit.goes_to || 'any line'}</b> · {groups.length} item{groups.length === 1 ? '' : 's'}{kit.labels_qty ? ` + ${kit.labels_qty} garment labels` : ''}</p>
                {kit.notes && <p className="text-sm text-slate-600 mt-1"><b>Note:</b> {kit.notes}</p>}
            </div>
            <ErrorBox text={error} />
            {kit.status === 'PREPARING' && <p className="mb-3 text-sm bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-700">The store is still preparing this kit — it can be signed once it is marked ready.{kit.sent_back_reason ? <> Sent back: <b className="text-rose-700">{kit.sent_back_reason}</b></> : ''}</p>}
            {kit.status === 'CANCELLED' && <p className="mb-3 text-sm bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-600">Cancelled: {kit.cancelled_reason}</p>}
            {kit.status === 'READY' && k.kind === 'SAMPLE' && <p className="mb-3 text-sm text-slate-600">A sample's kit — the trim store hands it over to sampling.</p>}
            {kit.status === 'READY' && !perm.sign && k.kind !== 'SAMPLE' && <p className="mb-3 text-sm text-slate-600">Waiting for a line loader to sign for it.</p>}
            {kit.status === 'SIGNED' && (() => { const h = k.handovers.find(x => x.id === kit.handover_id); return h ? (
                <p className="mb-3 text-sm bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2 text-indigo-900">Signed by <b>{h.signed_by_name || '—'}</b> for <b>{h.production_line_name}</b> · {h.issue_id ? <Link to={`/v3/trim-orders/slips/${h.issue_id}`} className="font-bold underline">{h.issue_no}</Link> : 'garment labels only'}{kit.bill_no ? ` · valuation bill ${kit.bill_no}` : ''}{returns.length ? <> · <b className="text-rose-700">{returns.length} line(s) rejected — back to the store</b></> : ''}</p>) : null; })()}

            {canSign && (
                <div className="flex flex-wrap items-end gap-3 mb-3">
                    <div className="min-w-[240px] flex-1 max-w-md">
                        <Field label="Goes to (line)">
                            <select className={`${inputCls} text-base py-2.5`} value={lineId} onChange={e => setLineId(e.target.value)}>
                                <option value="">— pick the line —</option>
                                {(() => { const mine = new Set((k.batch_lines || []).map(l => l.id)); return [...lines.filter(l => mine.has(l.id)), ...lines.filter(l => !mine.has(l.id))]; })()
                                    .map(l => <option key={`${l.id}-${l.stage || ''}`} value={l.id}>{l.name}{l.stage ? ` (${l.stage})` : ''}{(k.batch_lines || []).some(b => b.id === l.id) ? ' — batch is here' : ''}</option>)}
                            </select>
                        </Field>
                    </div>
                    <SecondaryButton onClick={allOk}><Check size={14} /> All received</SecondaryButton>
                    <SecondaryButton onClick={() => setMarks({})}>Clear</SecondaryButton>
                    <SecondaryButton onClick={() => { setFormError(''); setSendBack({ reason: '' }); }}><RotateCcw size={14} /> Send whole kit back</SecondaryButton>
                    <SecondaryButton onClick={async () => exportPickList(k, await loadLetterhead(), kit)}><FileDown size={14} /> Pick list</SecondaryButton>
                </div>
            )}
            {canSign && <p className="mb-3 text-sm text-slate-600">Tap each item as you find it in the bag. Something wrong — <b>Reject</b> it (all of it or part): what you don't take goes back to the store.</p>}

            <div className="space-y-4">
                {sections.map(sec => (
                    <div key={sec.key}>
                        <div className="flex items-baseline gap-2 mb-1.5 px-1">
                            <h2 className="text-base font-black uppercase tracking-wider text-slate-800">{sec.type}</h2>
                            <span className="text-xs text-slate-500">{sec.stage} · {sec.rows.length} item{sec.rows.length === 1 ? '' : 's'}{canSign ? ` · ${sec.rows.filter(g => mark(g.key)).length} checked` : ''}</span>
                        </div>
                        <div className="space-y-2">{sec.rows.map(g => <Row key={g.key} g={g} />)}</div>
                    </div>
                ))}
                {LAB && (
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

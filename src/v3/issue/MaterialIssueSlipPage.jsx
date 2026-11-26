// One fabric or trim slip. Fabric (4 Nov 2026, custody): the store reviews a draft and submits it, can recall or cancel it until cutting
// has received it; the cutting manager decides each roll, by scan or by hand. Stock moves on receipt. Slip PDF, pick list, roll labels.
// Fabric left over comes back on a return slip. Trim slips open under Trim kits, read only: their custody is the kit's signature.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useLocation, useParams } from 'react-router-dom';
import { ArrowLeft, FileDown, ListChecks, Tag, Send, Undo2, Ban, Pencil, PackageCheck, CheckCheck } from 'lucide-react';
import { materialIssueApi } from '../api/materialIssueApi';
import { trimKitsApi } from '../api/trimKitsApi';
import { apiError } from '../api/mastersApi';
import { PrimaryButton, SecondaryButton, ErrorBox, Loading, Field, inputCls } from '../components/ui';
import ItemFilter, { itemMatcher } from '../production/ItemFilter';
import { fmtDate } from '../salesOrders/SalesOrderStatusBadge';
import { loadLetterhead } from '../components/letterhead';
import { useWedgeScanner, feedback } from '../production/scanShared';
import { STATUS, slipRows, groupByType, coloursText, unitsText, when, fmtN, tookText, exportIssueSlip, exportPickList, exportRollLabels } from './issuePrint';

const ACTION = { DRAFT: 'Draft made', CHANGED: 'Draft changed', SUBMITTED: 'Submitted to cutting', RECALLED: 'Recalled', CANCELLED: 'Cancelled', RECEIVED: 'Received', REJECTED: 'Every roll refused' };

export default function MaterialIssueSlipPage() {
    const { id } = useParams();
    const trimPath = /^\/v3\/trim-(kits|orders)\//.test(useLocation().pathname);   // trim slips: /v3/trim-orders/slips/:id (26 Nov 2026; /v3/trim-kits/slips/:id still opens)
    const [s, setS] = useState(null);
    const [perm, setPerm] = useState({});
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [ask, setAsk] = useState(null);               // 'cancel' | 'lots'
    const [reason, setReason] = useState('');
    const [decide, setDecide] = useState({});           // roll id → { status, reason }
    const [acceptLots, setAcceptLots] = useState(false);
    const [scanMsg, setScanMsg] = useState(null);
    const [fq, setFq] = useState('');        // trim slip: item search + trim type (26 Nov 2026, owner: "add search and trim type filter in … /v3/trim-orders/slips/264")
    const [ftype, setFtype] = useState('');
    const load = useCallback(() => (trimPath ? trimKitsApi.slip(id) : materialIssueApi.issue(id)).then(res => setS(res.data)).catch(err => setError(apiError(err, 'Failed to load the slip.'))), [id, trimPath]);
    useEffect(() => { load(); if (!trimPath) materialIssueApi.permissions().then(res => setPerm(res.data)).catch(() => {}); }, [load, trimPath]);
    const pending = useMemo(() => (s?.planned || []).filter(p => p.status === 'PENDING'), [s]);
    const canReceive = Boolean(perm.receive) && s?.status === 'SUBMITTED';
    useWedgeScanner((code) => {
        const c = String(code).trim().toLowerCase();
        const hits = pending.filter(p => p.code.toLowerCase() === c);
        const found = hits.length ? hits : pending.filter(p => String(p.roll_no).toLowerCase() === c);
        if (found.length !== 1) { feedback('error'); setScanMsg({ ok: false, text: found.length ? `${code}: more than one roll has this number. Scan the roll label.` : `${code} isn't on this slip.` }); return; }
        setDecide(prev => ({ ...prev, [found[0].roll_id]: { status: 'RECEIVED' } }));
        feedback('success'); setScanMsg({ ok: true, text: `Roll ${found[0].roll_no} checked.` });
    }, canReceive);
    if (!s) return <div>{error ? <ErrorBox text={error} /> : <Loading />}</div>;
    const isTrim = s.lines.some(l => l.kind === 'TRIM');
    if (isTrim && !trimPath) return <Navigate to={`/v3/trim-orders/slips/${id}`} replace />;

    const act = async (fn) => {
        setBusy(true); setError('');
        try { const res = await fn(); if (res?.data) setS(res.data); setAsk(null); setReason(''); } catch (err) {
            setError(apiError(err, 'Failed.'));
            if (err?.response?.data?.mixed_lots && s.status === 'DRAFT') setAsk('lots');
            load();
        } finally { setBusy(false); }
    };
    const allRows = slipRows(s);
    const tMatch = itemMatcher(fq, ftype);
    const tFiltering = isTrim && Boolean(fq.trim() || ftype);
    const rows = tFiltering ? allRows.filter(tMatch) : allRows;   // a trim slip's list narrowed by the search / trim type
    const live = rows.filter(r => r.status !== 'REJECTED');
    // Fabric slips (23 Nov 2026): by fabric type (shell, pocketing …), each fabric inside it — was by garment colour (8 Nov).
    const types = isTrim ? null : groupByType(s, rows);
    const groups = types ? types.flatMap(t => t.fabrics.map((g, i) => ({ ...g, type: t, firstOfType: i === 0, lastOfType: i === t.fabrics.length - 1 }))) : null;
    const nTypes = types ? types.length : 0;
    // No status per roll unless it says something (owner, 23 Nov 2026: "not needed and confusing"): the slip's status is in the
    // header. The receiver checking the slip keeps the decisions and "checked x of y"; after that only refused / returned rolls show.
    const noteOf = (r) => [r.status === 'REJECTED' ? `Refused${r.reason ? `: ${r.reason}` : ''}` : '', r.returned_qty > 0 ? `${fmtN(r.returned_qty)} returned` : ''].filter(Boolean).join(' · ');
    const showState = canReceive || rows.some(r => r.status === 'REJECTED');
    const showNote = isTrim || canReceive || rows.some(r => noteOf(r));
    const stateText = (list) => {
        if (s.status === 'SUBMITTED') { const p = list.filter(r => pending.some(x => x.code === r.code)); const done = p.filter(r => decide[pending.find(x => x.code === r.code).roll_id]?.status).length; return `${done} of ${p.length}`; }
        const out = list.filter(r => r.status === 'REJECTED').length;
        return out ? `${out} refused` : '';
    };
    const mine = Boolean(perm.issue) && !isTrim;
    const allDecided = pending.length > 0 && pending.every(p => decide[p.roll_id]?.status === 'RECEIVED' || (decide[p.roll_id]?.status === 'REJECTED' && decide[p.roll_id]?.reason?.trim()));
    const anyIn = pending.some(p => decide[p.roll_id]?.status === 'RECEIVED');
    const b = STATUS[s.status] || {};
    const receive = () => act(() => materialIssueApi.receive(id, { rolls: pending.map(p => ({ roll_id: p.roll_id, status: decide[p.roll_id].status, reason: decide[p.roll_id].reason })), accept_mixed_lots: acceptLots }));
    return (
        <div>
            <Link to={isTrim ? '/v3/trim-orders?tab=slips' : '/v3/material-issue?tab=slips'} className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-indigo-600 mb-3"><ArrowLeft size={15} /> {isTrim ? 'Trim slips' : 'Fabric slips'}</Link>
            <div className="flex flex-wrap items-center gap-3 mb-3">
                <h1 className="text-2xl font-black text-slate-900">{s.issue_no}</h1>
                <span className={`text-xs font-black px-2 py-1 rounded border ${b.cls || ''}`}>{b.label || s.status}</span>
                <span className="ml-auto flex flex-wrap gap-2">
                    <SecondaryButton onClick={async () => exportIssueSlip(s, await loadLetterhead())}><FileDown size={14} /> Slip PDF</SecondaryButton>
                    {!isTrim && (s.status === 'DRAFT' || s.status === 'SUBMITTED') && <SecondaryButton onClick={async () => exportPickList(s, await loadLetterhead())}><ListChecks size={14} /> Pick list</SecondaryButton>}
                    {!isTrim && rows.some(r => r.code) && <SecondaryButton onClick={() => exportRollLabels(s)}><Tag size={14} /> Roll labels</SecondaryButton>}
                </span>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4 mb-3 grid sm:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
                <div><p className="text-xs font-bold text-slate-500">Order</p><Link to={`/v3/planning/orders/${s.order_id}`} className="font-semibold text-indigo-700 hover:underline">{s.order_no}</Link><span className="block text-xs text-slate-500">{s.customer_name}{s.cut_batch_code ? ` · batch ${s.cut_batch_code}` : ''}</span></div>
                <div><p className="text-xs font-bold text-slate-500">Goes to</p><span className="font-semibold">{s.stage}</span>{s.sample_request_id && <Link to={`/v3/samples/${s.sample_request_id}`} className="block text-xs font-bold text-violet-700 hover:underline">sample {s.sample_request_no} — handed over by the store</Link>}<span className="block text-xs text-slate-500">dated {fmtDate(s.issue_date)}</span></div>
                <div><p className="text-xs font-bold text-slate-500">Sent by</p><span className="font-semibold">{s.submitted_by_name || s.issued_by_name || '—'}</span><span className="block text-xs text-slate-500">{s.submitted_at ? when(s.submitted_at) : s.status === 'DRAFT' ? 'not sent yet' : ''}</span></div>
                <div><p className="text-xs font-bold text-slate-500">Received by</p><span className="font-semibold">{s.status === 'RECEIVED' || s.status === 'REJECTED' ? (s.received_by_name || s.received_by) : '—'}</span><span className="block text-xs text-slate-500">{s.received_at ? `${when(s.received_at)} · took ${tookText(s.submitted_at, s.received_at)}` : ''}</span></div>
            </div>
            {s.gate_override && <p className="mb-2 text-sm rounded-lg border border-rose-200 bg-rose-50 text-rose-800 px-3 py-2"><b>Cutting gate released</b>{s.gate_released_by ? ` by ${s.gate_released_by}` : ''}{s.gate_release_reason ? `: ${s.gate_release_reason}` : ' (order not fully allocated)'}.</p>}
            {s.mixed_lots && <p className="mb-2 text-sm rounded-lg border border-amber-200 bg-amber-50 text-amber-900 px-3 py-2"><b>Mixed dye lots:</b> {s.lot_reason || '—'}{s.lots_accepted_by_name ? ` · accepted by ${s.lots_accepted_by_name}` : ''}. Keep lots apart in the lay.</p>}
            {s.backdate_reason && <p className="mb-2 text-sm rounded-lg border border-amber-200 bg-amber-50 text-amber-900 px-3 py-2"><b>Dated in the past:</b> {s.backdate_reason}</p>}
            {s.notes && <p className="mb-2 text-sm rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"><b>Note:</b> {s.notes}</p>}
            {s.status === 'CANCELLED' && <p className="mb-2 text-sm rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"><b>Cancelled</b> by {s.cancelled_by_name || '—'} on {when(s.cancelled_at)}: {s.cancel_reason}</p>}
            <ErrorBox text={error} />
            {scanMsg && <p className={`my-2 text-sm font-semibold rounded-lg px-3 py-2 border ${scanMsg.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-rose-50 border-rose-200 text-rose-800'}`}>{scanMsg.text}</p>}
            {canReceive && <div className="flex flex-wrap items-center gap-2 my-2"><p className="text-sm font-semibold text-slate-700">Check each roll: scan its label, or mark it here.</p><SecondaryButton onClick={() => setDecide(Object.fromEntries(pending.map(p => [p.roll_id, { status: 'RECEIVED' }])))}><CheckCheck size={14} /> Mark all received</SecondaryButton></div>}
            {types && (
                <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto mb-3 mt-2">
                    <p className="px-3 pt-2.5 pb-1 text-xs font-black uppercase tracking-wider text-slate-500">Summary by fabric type</p>
                    <table className="w-full text-sm min-w-[720px]">
                        <thead className="bg-slate-50 text-left text-xs font-bold text-slate-500 uppercase tracking-wider"><tr><th className="px-3 py-2">Fabric</th><th className="px-3 py-2">Garment colours</th><th className="px-3 py-2">Dye lots</th><th className="px-3 py-2 text-right">Rolls</th><th className="px-3 py-2 text-right">Quantity</th>{showState && <th className="px-3 py-2">{canReceive ? 'Checked' : 'Refused'}</th>}</tr></thead>
                        {types.map(t => {
                            const tl = t.rows.filter(r => r.status !== 'REJECTED');
                            return (
                                <tbody key={t.key}>
                                    <tr className="border-t-2 border-slate-200 bg-slate-100 font-black text-slate-800">
                                        <td className="px-3 py-2" colSpan={3}>{t.label} <span className="text-xs font-semibold text-slate-500">· {t.fabrics.length} fabric{t.fabrics.length === 1 ? '' : 's'}</span></td>
                                        <td className="px-3 py-2 text-right tabular-nums">{tl.length}</td>
                                        <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{unitsText(tl)}</td>
                                        {showState && <td className="px-3 py-2 text-xs">{stateText(t.rows)}</td>}
                                    </tr>
                                    {t.fabrics.map(g => {
                                        const gl = g.rows.filter(r => r.status !== 'REJECTED');
                                        const lots = [...new Set(g.rows.map(r => r.dye_lot || '—'))];
                                        return (
                                            <tr key={g.key} className="border-t border-slate-100">
                                                <td className="px-3 py-2 pl-6 font-semibold text-slate-800">{g.label}</td>
                                                <td className="px-3 py-2 text-xs text-slate-600">{coloursText(g)}</td>
                                                <td className={`px-3 py-2 text-xs ${lots.length > 1 ? 'font-bold text-amber-800' : ''}`}>{lots.join(', ')}</td>
                                                <td className="px-3 py-2 text-right tabular-nums">{gl.length}</td>
                                                <td className="px-3 py-2 text-right tabular-nums font-bold whitespace-nowrap">{unitsText(gl)}</td>
                                                {showState && <td className="px-3 py-2 text-xs">{stateText(g.rows)}</td>}
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            );
                        })}
                        <tfoot className="bg-slate-50 border-t-2 border-slate-200 font-black"><tr><td className="px-3 py-2" colSpan={2}>Total · {groups.length} fabric{groups.length === 1 ? '' : 's'} in {nTypes} type{nTypes === 1 ? '' : 's'}</td><td className="px-3 py-2 text-xs">{new Set(rows.map(r => `${r.item_id}|${r.dye_lot || '—'}`)).size} lot(s)</td><td className="px-3 py-2 text-right tabular-nums">{live.length}</td><td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{unitsText(live)}</td>{showState && <td className="px-3 py-2 text-xs">{stateText(rows)}</td>}</tr></tfoot>
                    </table>
                </div>
            )}
            {isTrim && <div className="mt-2"><ItemFilter q={fq} setQ={setFq} type={ftype} setType={setFtype} types={[...new Set(allRows.map(r => r.type_name).filter(Boolean))].sort((a, b) => a.localeCompare(b))} shown={rows.length} total={allRows.length} /></div>}
            <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto mb-3 mt-2">
                <table className="w-full text-sm min-w-[720px]">
                    <thead className="bg-slate-50 text-left text-xs font-bold text-slate-500 uppercase tracking-wider"><tr>{isTrim ? <><th className="px-3 py-2 w-10">#</th><th className="px-3 py-2">Trim type</th><th className="px-3 py-2">Item</th></> : <><th className="px-3 py-2">Roll</th><th className="px-3 py-2">Lot</th><th className="px-3 py-2">Location</th></>}<th className="px-3 py-2 text-right">Quantity</th>{showNote && <th className="px-3 py-2">{canReceive ? 'Decision' : 'Note'}</th>}</tr></thead>
                    {(groups || [{ key: 'all', rows }]).map(g => <tbody key={g.key}>
                        {groups && g.firstOfType && (
                            <tr className="border-t-2 border-slate-300 bg-slate-200/70">
                                <td className="px-3 py-2 text-xs font-black uppercase tracking-wider text-slate-800" colSpan={showNote ? 5 : 4}>{g.type.label}</td>
                            </tr>
                        )}
                        {groups && (
                            <tr className="border-t border-slate-200 bg-indigo-50/60">
                                <td className="px-3 py-2" colSpan={showNote ? 5 : 4}><b className="text-slate-900">{g.label}</b><span className="ml-2 text-xs text-slate-600">{coloursText(g)}</span></td>
                            </tr>
                        )}
                        {g.rows.map((r, i) => {
                            const p = pending.find(x => x.code === r.code);
                            const dd = p && decide[p.roll_id];
                            return (
                                <tr key={r.code || i} className={`border-t border-slate-100 ${dd?.status === 'RECEIVED' ? 'bg-emerald-50/50' : dd?.status === 'REJECTED' ? 'bg-rose-50/50' : ''}`}>
                                    {isTrim ? <><td className="px-3 py-2 text-xs tabular-nums text-slate-500">{r.line_no}</td><td className="px-3 py-2 text-xs whitespace-nowrap">{r.type_name || '—'}</td><td className="px-3 py-2">{r.label}</td></>
                                        : <><td className="px-3 py-2 font-semibold">{r.roll_no || '—'}</td><td className="px-3 py-2">{r.dye_lot || <span className="text-amber-700">not recorded</span>}</td><td className="px-3 py-2">{r.location || '—'}</td></>}
                                    <td className="px-3 py-2 text-right tabular-nums font-bold whitespace-nowrap">{fmtN(r.qty)} {r.uom}{r.returned_qty > 0 && <span className="block text-[11px] font-normal text-slate-500">{fmtN(r.returned_qty)} returned</span>}</td>
                                    {showNote && <td className="px-3 py-2">
                                        {canReceive && p ? (
                                            <div className="flex flex-wrap items-center gap-2">
                                                <label className="inline-flex items-center gap-1 text-xs font-semibold"><input type="radio" name={`d${p.roll_id}`} checked={dd?.status === 'RECEIVED'} onChange={() => setDecide({ ...decide, [p.roll_id]: { status: 'RECEIVED' } })} /> Received</label>
                                                <label className="inline-flex items-center gap-1 text-xs font-semibold"><input type="radio" name={`d${p.roll_id}`} checked={dd?.status === 'REJECTED'} onChange={() => setDecide({ ...decide, [p.roll_id]: { status: 'REJECTED', reason: '' } })} /> Refuse</label>
                                                {dd?.status === 'REJECTED' && <input className="px-2 py-1 text-xs border border-slate-300 rounded" placeholder="Reason *" value={dd.reason} onChange={e => setDecide({ ...decide, [p.roll_id]: { status: 'REJECTED', reason: e.target.value } })} aria-label={`Reason for refusing roll ${r.roll_no}`} />}
                                            </div>
                                        ) : <span className={`text-xs font-bold ${r.status === 'REJECTED' ? 'text-rose-700' : 'text-slate-600'}`}>{noteOf(r)}</span>}
                                    </td>}
                                </tr>
                            );
                        })}
                        {groups && groups.length > 1 && (() => {
                            const gl = g.rows.filter(r => r.status !== 'REJECTED');
                            return <tr className="border-t border-slate-200 bg-slate-50/70 text-xs font-bold text-slate-700"><td className="px-3 py-1.5" colSpan={3}>{g.label} · {gl.length} roll{gl.length === 1 ? '' : 's'}</td><td className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap">{unitsText(gl)}</td>{showNote && <td />}</tr>;
                        })()}
                        {groups && nTypes > 1 && g.lastOfType && (() => {
                            const tl = g.type.rows.filter(r => r.status !== 'REJECTED');
                            return <tr className="border-t border-slate-300 bg-slate-100 text-xs font-black text-slate-800"><td className="px-3 py-1.5" colSpan={3}>{g.type.label} · {tl.length} roll{tl.length === 1 ? '' : 's'}</td><td className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap">{unitsText(tl)}</td>{showNote && <td />}</tr>;
                        })()}
                    </tbody>)}
                    {tFiltering && !rows.length && <tbody><tr><td colSpan={showNote ? 5 : 4} className="px-3 py-4 text-center text-sm text-slate-400">No item on this slip matches.</td></tr></tbody>}
                    <tfoot className="bg-slate-50 border-t-2 border-slate-200 font-black"><tr><td className="px-3 py-2" colSpan={3}>{tFiltering ? <span className="text-indigo-700">Showing {rows.length} of {allRows.length} · </span> : null}Total · {live.length} {isTrim ? 'item' : 'roll'}{live.length === 1 ? '' : 's'}{rows.length > live.length ? ` (${rows.length - live.length} refused, not counted)` : ''}</td><td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{unitsText(live)}</td>{showNote && <td />}</tr></tfoot>
                </table>
            </div>
            {canReceive && (
                <div className="bg-white border border-indigo-200 rounded-xl p-4 mb-3 space-y-2">
                    {s.mixed_lots && anyIn && <label className="flex items-center gap-2 text-sm font-semibold text-amber-900"><input type="checkbox" checked={acceptLots} onChange={e => setAcceptLots(e.target.checked)} /> I accept these mixed dye lots and will keep them apart in the lay.</label>}
                    <PrimaryButton onClick={receive} busy={busy} disabled={busy || !allDecided || (s.mixed_lots && anyIn && !acceptLots)}><PackageCheck size={15} /> {anyIn ? 'Receive' : 'Refuse the slip'}</PrimaryButton>
                    <p className="text-xs text-slate-500">Received rolls leave the store now. Refused rolls stay in the store, held for the order.</p>
                </div>
            )}
            {mine && (s.status === 'DRAFT' || s.status === 'SUBMITTED') && (
                <div className="bg-white border border-slate-200 rounded-xl p-4 mb-3">
                    <div className="flex flex-wrap gap-2">
                        {s.status === 'DRAFT' && <PrimaryButton onClick={() => act(() => materialIssueApi.submit(id, {}))} busy={busy} disabled={busy}><Send size={15} /> Submit to cutting</PrimaryButton>}
                        {s.status === 'DRAFT' && <Link to={`/v3/material-issue/orders/${s.order_id}`} className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg"><Pencil size={14} /> Change rolls</Link>}
                        {s.status === 'SUBMITTED' && <SecondaryButton onClick={() => act(() => materialIssueApi.recall(id))} disabled={busy}><Undo2 size={14} /> Recall to draft</SecondaryButton>}
                        <SecondaryButton onClick={() => { setReason(''); setAsk('cancel'); }} disabled={busy}><Ban size={14} /> Cancel slip</SecondaryButton>
                    </div>
                    <p className="mt-2 text-xs text-slate-500">{s.status === 'DRAFT' ? 'Check the rolls above. Once submitted they are locked and the cutting manager is told; nothing leaves the store until received.' : 'Locked and waiting for the cutting manager. Recall it to change it.'}</p>
                    {ask && (
                        <div className="mt-3 border-t border-slate-100 pt-3 space-y-2">
                            <Field label={ask === 'cancel' ? 'Reason for cancelling *' : 'Reason for sending mixed dye lots *'} hint={ask === 'lots' ? 'The cutting manager must accept them by name.' : 'The number stays, marked cancelled.'}><input className={inputCls} value={reason} onChange={e => setReason(e.target.value)} autoFocus /></Field>
                            <div className="flex gap-2">
                                <PrimaryButton busy={busy} disabled={busy || !reason.trim()} onClick={() => act(() => (ask === 'cancel' ? materialIssueApi.cancel(id, reason) : materialIssueApi.submit(id, { confirm_mixed_lots: true, lot_reason: reason })))}>{ask === 'cancel' ? 'Cancel the slip' : 'Submit anyway'}</PrimaryButton>
                                <SecondaryButton onClick={() => setAsk(null)}>Back</SecondaryButton>
                            </div>
                        </div>
                    )}
                </div>
            )}
            {!isTrim && s.status === 'RECEIVED' && <p className="mb-3 text-xs text-slate-500">Fabric left over comes back on a <Link to="/v3/material-returns" className="font-semibold text-indigo-700 hover:underline">return slip</Link>: the cutting manager drafts it, the fabric store receives it.</p>}
            {s.returns.length > 0 && <div className="bg-white border border-slate-200 rounded-xl p-4 mb-3"><p className="text-xs font-black uppercase tracking-wider text-slate-500 mb-2">Returns</p>{s.returns.map(r => <p key={r.id} className="text-sm"><span className="text-xs text-slate-400 mr-2">{when(r.created_at)}</span>Line {r.line_no}: {fmtN(r.qty)} back{r.user_name ? ` · ${r.user_name}` : ''} — {r.reason}</p>)}</div>}
            {s.history?.length > 0 && <div className="bg-white border border-slate-200 rounded-xl p-4"><p className="text-xs font-black uppercase tracking-wider text-slate-500 mb-2">History</p>{s.history.map(h => <p key={h.id} className="text-sm py-0.5"><span className="text-xs text-slate-400 mr-2">{when(h.created_at)}</span><b>{ACTION[h.action] || h.action}</b>{h.user_name ? ` · ${h.user_name}` : ''}{h.reason ? ` · ${h.reason}` : ''}{h.detail ? ` · ${h.detail}` : ''}</p>)}</div>}
        </div>
    );
}

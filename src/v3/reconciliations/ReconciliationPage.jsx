// One reconciliation (20 Oct 2026, phase 6): the figures (fabric per fabric, stage counts, trims per item), approvals —
// the merchandiser approves (a fabric report over the BOM with a reason) or sends it back; accounts acknowledges (and
// approves above the write-off threshold) — the runs of the same scope, Excel and print.
// 21 Oct 2026 (owner: "what's wrong with the reconciliation page" → "build all"): banners on top for an older run (link to
// the current one), an outdated report and a provisional one; the order (ordered / cut / batches); fabric as one table per
// kind × unit (shell, pocketing / lining) with a Total row, columns that are 0 for every fabric folded into a note.
// 21 Oct 2026 (rules RETURN_OR_CONSUMED): left-out fabric is back in the store before the report; shell end bits kept in
// the cutting room are consumed (own column), end bits returned to the store shown; written off = loss. Older reports keep
// their own columns.
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, FileDown, Printer, CheckCircle2, RotateCcw, BookCheck } from 'lucide-react';
import * as XLSX from 'xlsx';
import Modal from '../../shared/Modal';
import { reconciliationsApi } from '../api/reconciliationsApi';
import { apiError } from '../api/mastersApi';
import { Field, inputCls, PrimaryButton, SecondaryButton, ErrorBox, Loading } from '../components/ui';
import { KIND, StatusChip, ProvisionalChip, fmt, money, scopeOf, when } from './recShared';

const STAGE_ROWS = [['approved_first', 'Approved first time'], ['approved_after_rework', 'Approved after rework'], ['repaired_now', 'Repaired at once'], ['repaired_after_rework', 'Repaired after rework'],
    ['replaced', 'Replaced (new material), then passed'], ['recut', 'Re-cut replacement (before 18 Oct)'], ['rejected', 'Rejected (floor in-charge)'], ['still_open', 'Still in rework / replacement'], ['not_checked', 'Not checked']];

function exportExcel(r) {
    const wb = XLSX.utils.book_new();
    const f = r.figures;
    if (r.kind === 'FABRIC') {
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(f.fabrics.map(x => ({
            Fabric: x.label, Kind: x.support ? 'Pocketing / lining' : 'Shell', Unit: x.uom, Issued: x.issued_net, Laid: x.laid, 'Waste at lays': x.waste_at_lay ?? 0, Short: x.short, 'Not accounted': x.unaccounted, Replacements: x.replacements, 'Written off': x.written_off,
            'End bits in cutting (left out)': x.end_bits_in_cutting, 'Not cut (left out)': x.not_cut, Consumption: x.consumption, 'Garments cut': x.garments_cut,
            'Per garment': x.actual_per_garment, 'BOM per garment': x.bom_per_garment, Within: x.within ? 'yes' : 'NO', Rate: x.rate, 'Write-off value': x.writeoff_value, 'Over-BOM value': x.overrun_value,
        }))), 'Fabric');
    } else if (r.kind === 'STAGE') {
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{ Line: 'In (came to the stage)', Count: f.in }, ...STAGE_ROWS.map(([k, l]) => ({ Line: l, Count: f[k] })), { Line: 'Dropped out earlier', Count: f.dropped_earlier }]), 'Stage');
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(f.rejected_list.map(x => ({ Item: x.label, Part: x.part_name || '', Reason: x.reason, Was: x.previous_status, By: x.rejected_by }))), 'Rejected');
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(f.defects.map(d => ({ Code: d.code, Defect: d.description, Count: d.n }))), 'Defects');
    } else {
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(f.items.map(x => ({ Item: x.label, Unit: x.uom, Kit: x.kit_qty, Handed: x.handed, 'Not handed': x.not_handed, Returned: x.returned, Net: x.net, Used: x.used, 'Over (+) / under (−)': x.variance, Rate: x.rate, 'Lost value': x.lost_value }))), 'Trims');
    }
    XLSX.writeFile(wb, `Reconciliation-${r.kind}-${scopeOf(r).replace(/[^\w-]+/g, '-')}-run${r.run_no}.xlsx`);
}

// Fabric figures as tables (21 Oct 2026): one per kind (shell / pocketing & lining) × unit, so totals never add yards to
// metres. Per garment on the Total row = total consumption ÷ total garments; BOM = the BOM weighted by garments.
const sum = (rows, k) => rows.reduce((a, x) => a + (Number(x[k]) || 0), 0);
const r4 = (n) => Math.round(n * 10000) / 10000;
const FAB_COLS = {
    shell: [['issued_net', 'Issued'], ['laid', 'Laid in batches'], ['short', 'Short (supplier)'], ['unaccounted', 'Not accounted for'], ['replacements', 'Replacements'], ['written_off', 'Written off'], ['left_out', 'Left out (end bits / not cut)'], ['consumption', 'Consumption']],
    support: [['issued_net', 'Issued'], ['laid', 'Laid in lays'], ['waste_at_lay', 'Waste at lays'], ['written_off', 'Written off'], ['left_out', 'Left out (at cutting)'], ['consumption', 'Consumption']],
};
// Reports under "left-out fabric must go back to the store" (21 Oct 2026).
const FAB_COLS_RETURN = {
    shell: [['issued_net', 'Issued (net of returns)'], ['laid', 'Laid in batches'], ['short', 'Short (supplier)'], ['unaccounted', 'Not accounted for'], ['replacements', 'Replacements'], ['written_off', 'Written off (loss)'], ['end_bits_in_cutting', 'End bits kept (consumed)'], ['end_bits_returned', 'End bits returned to store'], ['consumption', 'Consumption']],
    support: [['issued_net', 'Issued (net of returns)'], ['laid', 'Laid in lays'], ['waste_at_lay', 'Waste at lays'], ['written_off', 'Written off (loss)'], ['consumption', 'Consumption']],
};
const FOLDABLE = ['short', 'unaccounted', 'replacements', 'written_off', 'waste_at_lay', 'left_out', 'end_bits_in_cutting', 'end_bits_returned'];
function FabricTables({ fabrics, rules }) {
    const returnRule = rules === 'RETURN_OR_CONSUMED';
    const groups = new Map();
    for (const x of fabrics) {
        const key = `${x.support ? 'support' : 'shell'}|${x.uom}`;
        if (!groups.has(key)) groups.set(key, { kind: x.support ? 'support' : 'shell', uom: x.uom, rows: [] });
        groups.get(key).rows.push({ ...x, left_out: (Number(x.end_bits_in_cutting) || 0) + (Number(x.not_cut) || 0) });
    }
    const th = 'px-2 py-2 text-right align-bottom leading-tight';
    const td = 'px-2 py-1.5 text-right tabular-nums';
    return [...groups.values()].sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'shell' ? -1 : 1)).map(g => {
        const all = (returnRule ? FAB_COLS_RETURN : FAB_COLS)[g.kind];
        const zero = all.filter(([k]) => FOLDABLE.includes(k) && g.rows.every(x => !Number(x[k])));
        const cols = all.filter(c => !zero.includes(c));
        const over = g.rows.some(x => Number(x.overrun_value));
        const garments = sum(g.rows, 'garments_cut'), cons = sum(g.rows, 'consumption');
        const bomW = g.rows.reduce((a, x) => a + (x.bom_per_garment != null ? x.bom_per_garment * x.garments_cut : 0), 0);
        const totPer = garments ? r4(cons / garments) : null, totBom = garments ? r4(bomW / garments) : null;
        const allWithin = g.rows.every(x => x.within);
        const pieces = g.kind === 'support' && g.rows.some(x => x.pieces);
        const woDetail = (x) => [['under 0.3 m', x.written_off_under_min], ['surplus', x.written_off_surplus], ['by hand', x.written_off_manual]].filter(([, v]) => Number(v)).map(([l, v]) => `${l} ${fmt(v)}`).join(' · ');
        return (
            <div key={`${g.kind}|${g.uom}`} className="bg-white border border-slate-200 rounded-xl mb-4 overflow-x-auto">
                <p className="px-4 pt-3 font-black text-slate-800">{g.kind === 'shell' ? 'Shell fabric' : 'Pocketing / lining'} <span className="text-xs font-semibold text-slate-500">({g.uom})</span></p>
                <table className="w-full text-sm min-w-[980px] mt-2">
                    <thead className="bg-slate-50 text-[11px] font-bold text-slate-500 uppercase tracking-wide"><tr>
                        <th className="px-3 py-2 text-left">Fabric</th>{cols.map(([k, l]) => <th key={k} className={th}>{l}</th>)}
                        <th className={th}>Garments</th><th className={th}>Per garment</th><th className={th}>BOM</th><th className="px-2 py-2 text-center">vs BOM</th>
                        <th className={th}>Write-off ₹</th>{over && <th className={th}>Over BOM ₹</th>}
                    </tr></thead>
                    <tbody>{g.rows.map(x => (
                        <tr key={x.item_id} className={`border-t border-slate-100 ${x.within ? '' : 'bg-rose-50/60'}`}>
                            <td className="px-3 py-1.5 font-semibold text-slate-800 whitespace-nowrap">{x.label}{x.rate != null ? <span className="block text-[11px] font-normal text-slate-500">₹{fmt(x.rate, 2)} / {x.uom} ({x.rate_source})</span> : <span className="block text-[11px] font-normal text-amber-700">no rate</span>}</td>
                            {cols.map(([k]) => <td key={k} className={`${td} ${k === 'consumption' ? 'font-bold' : ''} ${k === 'unaccounted' && x[k] ? 'text-amber-700 font-semibold' : ''}`}>{fmt(x[k])}{k === 'written_off' && woDetail(x) ? <span className="block text-[10px] text-slate-500">{woDetail(x)}</span> : null}</td>)}
                            <td className={td}>{x.garments_cut}</td><td className={`${td} font-bold ${x.within ? 'text-emerald-700' : 'text-rose-700'}`}>{fmt(x.actual_per_garment, 4)}</td><td className={td}>{fmt(x.bom_per_garment, 4)}</td>
                            <td className={`px-2 py-1.5 text-center font-black ${x.within ? 'text-emerald-700' : 'text-rose-700'}`}>{x.within ? '✓' : 'over'}</td>
                            <td className={td}>{money(x.writeoff_value)}</td>{over && <td className={`${td} text-rose-700`}>{money(x.overrun_value)}</td>}
                        </tr>
                    ))}</tbody>
                    <tfoot><tr className="border-t-2 border-slate-300 bg-slate-50 font-black">
                        <td className="px-3 py-2">Total ({g.rows.length})</td>{cols.map(([k]) => <td key={k} className={`${td} py-2`}>{fmt(sum(g.rows, k))}</td>)}
                        <td className={`${td} py-2`}>{garments}</td><td className={`${td} py-2 ${allWithin ? 'text-emerald-700' : 'text-rose-700'}`}>{fmt(totPer, 4)}</td><td className={`${td} py-2`}>{fmt(totBom, 4)}</td>
                        <td className={`px-2 py-2 text-center ${allWithin ? 'text-emerald-700' : 'text-rose-700'}`}>{allWithin ? '✓' : 'over'}</td>
                        <td className={`${td} py-2`}>{money(sum(g.rows, 'writeoff_value'))}</td>{over && <td className={`${td} py-2 text-rose-700`}>{money(sum(g.rows, 'overrun_value'))}</td>}
                    </tr></tfoot>
                </table>
                {pieces && (
                    <table className="w-full max-w-2xl text-sm mt-3 mx-4 mb-1">
                        <thead className="text-[11px] font-bold text-slate-500 uppercase tracking-wide"><tr><th className="py-1.5 text-left">Pieces</th><th className={th}>Cut</th><th className={th}>Handed with batches</th><th className={th}>Replaced</th><th className={th}>Left (not handed)</th></tr></thead>
                        <tbody>{g.rows.filter(x => x.pieces).map(x => (
                            <tr key={x.item_id} className="border-t border-slate-100"><td className="py-1.5 font-semibold text-slate-800 whitespace-nowrap">{x.label}</td><td className={td}>{fmt(x.pieces.cut)}</td><td className={td}>{fmt(x.pieces.handed)}</td><td className={td}>{fmt(x.pieces.replaced)}</td><td className={`${td} ${x.pieces.left ? 'text-amber-700 font-bold' : ''}`}>{fmt(x.pieces.left)}</td></tr>
                        ))}</tbody>
                        <tfoot><tr className="border-t-2 border-slate-300 font-black"><td className="py-1.5">Total</td>{['cut', 'handed', 'replaced', 'left'].map(k => <td key={k} className={td}>{fmt(g.rows.reduce((a, x) => a + (x.pieces?.[k] || 0), 0))}</td>)}</tr></tfoot>
                    </table>
                )}
                <p className="px-4 py-2 text-xs text-slate-500">
                    {returnRule
                        ? <>Consumption = issued, net of what went back to the store{g.kind === 'shell' ? '; end bits kept in the cutting room are counted as consumed' : ' (waste at the lays is part of it, like the shell\'s lay ends)'}. Written off = loss.</>
                        : <>Consumption = issued − left out{g.kind === 'support' ? ' (waste at the lays is part of it, like the shell\'s lay ends)' : ''}.</>} Total per garment = total consumption ÷ total garments; BOM weighted by garments.
                    {zero.length > 0 && <> 0 for every fabric (not shown): {zero.map(([, l]) => l).join(', ')}.</>}
                </p>
            </div>
        );
    });
}

export default function ReconciliationPage() {
    const { id } = useParams();
    const [r, setR] = useState(null);
    const [perm, setPerm] = useState({ generate: {} });
    const [error, setError] = useState('');
    const [ask, setAsk] = useState(null);   // { title, label, required, run(text) }
    const [txt, setTxt] = useState('');
    const [busy, setBusy] = useState(false);
    const [formError, setFormError] = useState('');
    const load = useCallback(() => reconciliationsApi.get(id).then(res => setR(res.data)).catch(err => setError(apiError(err, 'Failed to load.'))), [id]);
    useEffect(() => { load(); reconciliationsApi.permissions().then(res => setPerm(res.data)).catch(() => {}); }, [load]);
    if (!r) return error ? <ErrorBox text={error} /> : <Loading />;
    const f = r.figures;
    const open = (cfg) => { setTxt(''); setFormError(''); setAsk(cfg); };
    const run = async () => {
        if (ask.required && !txt.trim()) return;
        setBusy(true); setFormError('');
        try { setR((await ask.run(txt.trim())).data); setAsk(null); } catch (err) { setFormError(apiError(err, 'Failed.')); } finally { setBusy(false); }
    };
    const live = !r.superseded && !r.outdated_at;
    const current = r.runs.find(x => !x.superseded);
    const provisional = Array.isArray(f.provisional) ? f.provisional : [];
    // Left-out / still-open warnings are listed under Provisional; the rest stay as warnings.
    const warnings = (f.warnings || []).filter(w => !provisional.length || !/left out|not handed|still being cut|waiting for the merchandiser/.test(w));
    return (
        <div>
            <Link to="/v3/reconciliations" className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-indigo-600 mb-3 print:hidden"><ArrowLeft size={15} /> Reconciliations</Link>
            <div className="flex flex-wrap items-center gap-3 mb-1">
                <h1 className="text-2xl font-black text-slate-900">{KIND[r.kind]} reconciliation — {scopeOf(r)}</h1>
                <StatusChip r={r} />
                {!r.outdated_at && <ProvisionalChip n={provisional.length} />}
                {r.superseded && <span className="text-[11px] font-black px-2 py-0.5 rounded border bg-slate-100 text-slate-500 border-slate-300">older run</span>}
            </div>
            <p className="text-sm text-slate-600 mb-3">{r.order_no}{r.batch_code ? ` · ${r.batch_code}` : ''} · run {r.run_no} · generated by {r.generated_by_name || '—'} on {when(r.generated_at)}</p>
            {r.superseded && current && (
                <div className="mb-3 rounded-lg border border-slate-300 bg-slate-100 px-3 py-2 text-sm text-slate-700 print:hidden">
                    <b>Older run</b> — kept for the record; run {current.run_no} ({when(current.generated_at)}) is the current one. <Link to={`/v3/reconciliations/${current.id}`} className="font-bold text-indigo-700 hover:underline">Open run {current.run_no}</Link>
                </div>
            )}
            {r.outdated_at && (
                <div className="mb-3 rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-900">
                    <b>Outdated</b> — {r.outdated_reason}{r.outdated_by_name ? ` (${r.outdated_by_name}, ${when(r.outdated_at)})` : ` (${when(r.outdated_at)})`}. These figures no longer hold: it can't be approved or acknowledged — generate it again{r.kind === 'FABRIC' ? ' once the order\'s batches are finalised' : ''}.
                </div>
            )}
            {!r.outdated_at && provisional.length > 0 && (
                <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    <p className="font-bold">Provisional — these figures will still change:</p>
                    <ul className="list-disc pl-5">{provisional.map(x => <li key={x}>{x}</li>)}</ul>
                    <p className="text-xs mt-1">Left-out fabric is not in the consumption. Write it off or return it, finish the batches, then generate again for the final report.</p>
                </div>
            )}
            <div className="flex flex-wrap gap-2 mb-3 print:hidden">
                {live && perm.approve && r.merch_status === 'PENDING' && <PrimaryButton onClick={() => open({ title: 'Approve', label: r.kind === 'FABRIC' ? 'Reason for approving fabric used above the BOM *' : 'Note (optional)', required: r.kind === 'FABRIC', run: (t) => reconciliationsApi.approve(id, t || undefined) })}><CheckCircle2 size={14} /> Approve</PrimaryButton>}
                {live && perm.approve && r.merch_status === 'PENDING' && <SecondaryButton onClick={() => open({ title: 'Send back', label: 'What has to be looked at again *', required: true, run: (t) => reconciliationsApi.sendBack(id, t) })}><RotateCcw size={14} /> Send back</SecondaryButton>}
                {live && perm.accounts && r.accounts_approval_required && !r.accounts_approved_at && <PrimaryButton onClick={() => open({ title: 'Approve the write-off (accounts)', label: 'Note (optional)', run: (t) => reconciliationsApi.acknowledge(id, { approve: true, note: t || undefined }) })}><CheckCircle2 size={14} /> Approve write-off (accounts)</PrimaryButton>}
                {live && perm.accounts && !r.acknowledged_at && <SecondaryButton onClick={() => open({ title: 'Acknowledge', label: 'Note (optional)', run: (t) => reconciliationsApi.acknowledge(id, { note: t || undefined }) })}><BookCheck size={14} /> Acknowledge</SecondaryButton>}
                <span className="ml-auto flex gap-2">
                    <SecondaryButton onClick={() => exportExcel(r)}><FileDown size={14} /> Excel</SecondaryButton>
                    <SecondaryButton onClick={() => window.print()}><Printer size={14} /> Print / PDF</SecondaryButton>
                </span>
            </div>
            <ErrorBox text={error} />
            <div className={`grid gap-3 mb-4 text-sm ${f.order ? 'sm:grid-cols-2 lg:grid-cols-4' : 'sm:grid-cols-3'}`}>
                {f.order && <div className="bg-white border border-slate-200 rounded-xl p-3"><p className="text-xs font-bold text-slate-500">Order</p>
                    <p className="font-bold text-slate-800">{fmt(f.order.cut)} of {fmt(f.order.ordered)} garments cut</p>
                    <p className="text-xs text-slate-600">{f.order.batches_cut} batch(es) finalised{f.order.batches_open ? ` · ${f.order.batches_open} still being cut` : ''}</p></div>}
                <div className="bg-white border border-slate-200 rounded-xl p-3"><p className="text-xs font-bold text-slate-500">Merchandiser</p>
                    <p className="font-bold text-slate-800">{r.merch_status === 'AUTO' ? 'Not needed — within the BOM' : r.merch_status === 'PENDING' ? 'Waiting' : `${r.merch_status === 'APPROVED' ? 'Approved' : 'Sent back'} by ${r.merch_by_name || '—'}`}</p>
                    {r.merch_note && <p className="text-xs text-slate-600">“{r.merch_note}”</p>}</div>
                <div className="bg-white border border-slate-200 rounded-xl p-3"><p className="text-xs font-bold text-slate-500">Accounts</p>
                    <p className="font-bold text-slate-800">{r.acknowledged_at ? `Acknowledged by ${r.acknowledged_by_name || '—'}` : 'Not acknowledged yet'}</p>
                    {r.accounts_approval_required && <p className="text-xs font-semibold text-amber-800">{r.accounts_approved_at ? `Write-off approved by ${r.accounts_approved_by_name || '—'}` : 'Write-off above the threshold — needs accounts\' approval'}</p>}
                    {r.ack_note && <p className="text-xs text-slate-600">“{r.ack_note}”</p>}</div>
                <div className="bg-white border border-slate-200 rounded-xl p-3"><p className="text-xs font-bold text-slate-500">Value</p>
                    <p className="font-bold text-slate-800">{r.kind === 'TRIM' ? `Lost / unaccounted ${money(r.writeoff_value)}` : r.kind === 'FABRIC' ? `Written off ${money(r.writeoff_value)}` : '—'}</p>
                    {r.overrun_value ? <p className="text-xs text-rose-700">Over the BOM: {money(r.overrun_value)}</p> : null}{r.unpriced && <p className="text-xs text-slate-500">Some items have no rate.</p>}</div>
            </div>
            {warnings.length > 0 && <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">{warnings.map(w => <p key={w}>{w}</p>)}</div>}

            {r.kind === 'FABRIC' && <FabricTables fabrics={f.fabrics} rules={f.rules} />}

            {r.kind === 'STAGE' && (
                <div className="grid lg:grid-cols-2 gap-4 mb-4">
                    <div className="bg-white border border-slate-200 rounded-xl p-4">
                        <h2 className="font-black text-slate-800 mb-2">{f.stage} — {f.unit}</h2>
                        <table className="w-full text-sm"><tbody>
                            <tr className="font-black"><td className="py-1">In (came to the stage)</td><td className="py-1 text-right tabular-nums">{f.in}</td></tr>
                            {STAGE_ROWS.map(([k, l]) => <tr key={k} className="border-t border-slate-100"><td className={`py-1 ${k === 'rejected' && f[k] ? 'text-rose-700 font-semibold' : 'text-slate-600'}`}>{l}</td><td className="py-1 text-right tabular-nums">{f[k]}</td></tr>)}
                            <tr className="border-t-2 border-slate-300"><td className="py-1 text-slate-600">Dropped out earlier (garment rejected at an earlier stage)</td><td className="py-1 text-right tabular-nums">{f.dropped_earlier}</td></tr>
                        </tbody></table>
                        <p className={`mt-2 text-xs font-bold ${f.balanced ? 'text-emerald-700' : 'text-rose-700'}`}>{f.balanced ? 'Balanced: in = every outcome.' : 'Does not balance — check the stage.'}</p>
                    </div>
                    <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
                        <div><p className="font-black text-slate-800 mb-1">Rejected</p>{f.rejected_list.length === 0 ? <p className="text-sm text-slate-400">None.</p> : f.rejected_list.map((x, i) => <p key={i} className="text-sm"><b>{x.part_name ? `${x.part_name} ` : ''}{x.label}</b> — {x.reason} <span className="text-xs text-slate-500">({x.previous_status === 'REPLACEMENT' ? 'was waiting for replacement' : 'was in rework'}{x.rejected_by ? `, ${x.rejected_by}` : ''})</span></p>)}</div>
                        <div><p className="font-black text-slate-800 mb-1">Defects by code</p>{f.defects.length === 0 ? <p className="text-sm text-slate-400">None.</p> : f.defects.map(d => <p key={d.code} className="text-sm"><b>{d.code}</b> {d.description} <span className="text-slate-500">× {d.n}</span></p>)}</div>
                    </div>
                </div>
            )}

            {r.kind === 'TRIM' && (
                <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto mb-4">
                    <p className="px-4 pt-3 text-sm text-slate-600">{f.kit_no} · {f.garments_cut} garments cut{f.garments_rejected ? ` · ${f.garments_rejected} rejected (left out of "used")` : ''} · used = good garments × the kit's per-garment rate</p>
                    <table className="w-full text-sm min-w-[860px]">
                        <thead className="text-xs font-bold text-slate-500 uppercase tracking-wider text-right"><tr><th className="px-3 py-2 text-left">Item</th><th className="px-3 py-2">Kit</th><th className="px-3 py-2">Handed</th><th className="px-3 py-2">Not handed</th><th className="px-3 py-2">Returned</th><th className="px-3 py-2">Net</th><th className="px-3 py-2">Used</th><th className="px-3 py-2">Over / under</th><th className="px-3 py-2">Value</th></tr></thead>
                        <tbody>{f.items.map(x => (
                            <tr key={x.item_id} className="border-t border-slate-100 text-right tabular-nums">
                                <td className="px-3 py-2 text-left font-semibold text-slate-800">{x.label}<span className="block text-xs font-normal text-slate-500">{x.uom}</span></td>
                                <td className="px-3 py-2">{fmt(x.kit_qty)}</td><td className="px-3 py-2">{fmt(x.handed)}</td><td className="px-3 py-2">{fmt(x.not_handed)}</td><td className="px-3 py-2">{fmt(x.returned)}</td>
                                <td className="px-3 py-2 font-semibold">{fmt(x.net)}</td><td className="px-3 py-2">{fmt(x.used)}</td>
                                <td className={`px-3 py-2 font-bold ${x.variance > 0.0005 ? 'text-rose-700' : x.variance < -0.0005 ? 'text-amber-700' : 'text-emerald-700'}`}>{x.variance > 0 ? '+' : ''}{fmt(x.variance)}</td>
                                <td className="px-3 py-2">{money(x.lost_value)}</td>
                            </tr>
                        ))}</tbody>
                    </table>
                    <p className="px-4 pb-3 text-xs text-slate-500">Over (+) = handed and not used or returned: lost / unaccounted. Under (−) = used more than handed.</p>
                </div>
            )}

            {r.runs.length > 1 && (
                <div className="bg-white border border-slate-200 rounded-xl p-4 print:hidden">
                    <p className="text-xs font-black uppercase tracking-wider text-slate-500 mb-1">Runs</p>
                    {r.runs.map(x => <p key={x.id} className="text-sm py-0.5">{x.id === r.id ? <b>Run {x.run_no}</b> : <Link to={`/v3/reconciliations/${x.id}`} className="text-indigo-700 hover:underline">Run {x.run_no}</Link>} · {when(x.generated_at)} · {x.outdated_at ? <span className="text-rose-700 font-semibold">outdated</span> : x.status.toLowerCase().replace('_', ' ')}{x.superseded ? ' (older)' : ''}</p>)}
                </div>
            )}

            {ask && (
                <Modal title={ask.title} onClose={() => setAsk(null)}>
                    <div className="space-y-3 w-[min(440px,85vw)]">
                        <Field label={ask.label}><textarea className={`${inputCls} min-h-[80px]`} value={txt} onChange={e => setTxt(e.target.value)} autoFocus /></Field>
                        <ErrorBox text={formError} />
                        <div className="flex justify-end gap-2"><SecondaryButton onClick={() => setAsk(null)}>Back</SecondaryButton><PrimaryButton onClick={run} busy={busy} disabled={busy || (ask.required && !txt.trim())}>{ask.title}</PrimaryButton></div>
                    </div>
                </Modal>
            )}
        </div>
    );
}

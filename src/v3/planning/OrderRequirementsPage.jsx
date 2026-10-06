// One approved order's material requirements: fabric and trim grids (rows =
// exact items, columns = garment colours), with the calculation behind every
// cell, the cut allowance per order line, and the change log. Numbers come
// from requirementsEngine.js and update automatically when the order changes.
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Pencil, RefreshCw, FileSpreadsheet, FileDown, AlertTriangle, ShieldCheck } from 'lucide-react';
import * as XLSX from 'xlsx';
import Modal from '../../shared/Modal';
import { planningApi } from '../api/planningApi';
import { apiError } from '../api/mastersApi';
import { Field, inputCls, PrimaryButton, SecondaryButton, ErrorBox, Loading } from '../components/ui';
import { fmtDate } from '../salesOrders/SalesOrderStatusBadge';
import AllocateModal from './AllocateModal';
import OrderMilestonesPanel from './OrderMilestonesPanel';
import TrimStatusGrid from './TrimStatusGrid';
import { exportTrimReservationPdf } from './trimReservationPdf';
import { useV3Access } from '../V3Access';
import { ReadinessChip, READY_STATUS, daysText } from './readinessShared';

const fmt = (n, uom) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: uom === 'pcs' ? 0 : 2 });
const SOURCE = { EXACT: 'exact colour', TONE: 'by tone', ALL: 'all colours' };
const COVER = { FULL: ['covered', 'bg-emerald-50 text-emerald-700 border-emerald-200'], PARTIAL: ['part', 'bg-amber-50 text-amber-800 border-amber-200'], NONE: ['none', 'bg-rose-50 text-rose-700 border-rose-200'] };
const ALLOC_ACTION = { ALLOCATE: 'Allocated', RELEASE: 'Released', AUTO_RELEASE: 'Released automatically', ISSUE: 'Issued to production', ISSUE_RETURN: 'Returned from production' };
const CAUSE = { APPROVED: 'Approved', REVISED: 'Order revised', BOM_CHANGED: 'BOM changed', CANCELLED: 'Order cancelled', ALLOWANCE_CHANGED: 'Allowance changed', RECALCULATED: 'Recalculated' };

function exportExcel(data) {
    const wb = XLSX.utils.book_new();
    const grid = data.items.map(it => ({
        Type: it.kind === 'FABRIC' ? 'Fabric' : 'Trim', Item: it.label, 'Used as': it.usage.join(', '), Unit: it.uom,
        ...Object.fromEntries(data.colours.map(c => [c.name, it.by_colour[c.id] ? Number(it.by_colour[c.id]) : ''])),
        Required: it.required_display, Allocated: it.allocated, Issued: it.issued || 0, Shortfall: it.shortfall, 'On requisition': it.pr_pending + it.pr_approved, 'Still to raise': it.to_raise, 'Purchase qty': it.purchase_qty ?? '', 'Purchase unit': it.purchase_uom || '',
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(grid), 'Requirements');
    const calc = [];
    for (const it of data.items) for (const r of it.rows) for (const d of r.detail) {
        calc.push({ Item: it.label, Unit: it.uom, Line: r.line_no, Style: r.style_code, 'BOM line': r.bom_line, Colour: r.colour, From: SOURCE[r.source] || '',
            Size: d.size, Ordered: d.ordered, Planned: d.planned, 'Consumption / garment': d.consumption, 'Wastage %': d.wastage_pct, Required: d.qty });
    }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(calc), 'Calculation');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.changes.map(c => ({
        When: new Date(c.created_at).toLocaleString('en-IN'), Why: CAUSE[c.cause] || c.cause, Revision: c.revision_no || '', Item: c.item_label, Unit: c.uom, From: c.old_qty, To: c.new_qty, By: c.user_name || '',
    }))), 'Changes');
    XLSX.writeFile(wb, `Requirements-${data.order.order_no.replace(/[^\w-]+/g, '-')}.xlsx`);
}

export default function OrderRequirementsPage() {
    const { me } = useV3Access();
    const { orderId } = useParams();
    const [data, setData] = useState(null);
    const [perms, setPerms] = useState({ plan: false, settings: false });
    // Allocate / release / raise: the merchandiser for all material, each store for its own kind.
    const myKinds = perms.plan_kinds || (perms.plan ? ['FABRIC', 'TRIM'] : []);
    const anyKind = myKinds.length > 0;
    const canKind = (k) => myKinds.includes(k);
    const [tab, setTab] = useState('FABRIC');
    const [error, setError] = useState('');
    const [cell, setCell] = useState(null);           // drill-down { item, colour }
    const [allowance, setAllowance] = useState(null); // { line, pct, reason }
    const [target, setTarget] = useState(null);       // allocate / release
    const [ov, setOv] = useState(null);               // readiness override / revoke { mode, reason }
    const [busy, setBusy] = useState(false);
    const [formError, setFormError] = useState('');

    const load = useCallback(() => planningApi.requirements(orderId).then(res => setData(res.data))
        .catch(err => setError(apiError(err, 'Failed to load requirements.'))), [orderId]);
    useEffect(() => {
        load();
        planningApi.permissions().then(res => setPerms(res.data)).catch(() => {});
    }, [load]);

    if (!data) return <div>{error ? <ErrorBox text={error} /> : <Loading />}</div>;
    const { order } = data;
    const shown = data.items.filter(i => i.kind === tab);
    const approved = order.status === 'APPROVED';

    const saveAllowance = async () => {
        setBusy(true); setFormError('');
        try {
            setData((await planningApi.setLineAllowance(allowance.line.id, { cut_allowance_pct: allowance.pct, reason: allowance.reason })).data);
            setAllowance(null);
        } catch (err) { setFormError(apiError(err, 'Failed to save.')); } finally { setBusy(false); }
    };
    const saveOverride = async () => {
        setBusy(true); setFormError('');
        try {
            const res = ov.mode === 'override' ? await planningApi.overrideReadiness(orderId, ov.reason) : await planningApi.revokeOverride(orderId, ov.reason);
            setData(res.data); setOv(null);
        } catch (err) { setFormError(apiError(err, 'Failed.')); } finally { setBusy(false); }
    };
    const recalc = async () => {
        if (!window.confirm('Recalculate this order\'s requirements from its lines and BOMs now? (Normally automatic; this is a repair tool.)')) return;
        setBusy(true); setError('');
        try { setData((await planningApi.recalculate(orderId, 'Manual recalculation')).data); } catch (err) { setError(apiError(err, 'Failed to recalculate.')); } finally { setBusy(false); }
    };

    return (
        <div>
            <Link to="/v3/planning" className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-indigo-600 mb-3"><ArrowLeft size={15} /> Material requirements</Link>
            <div className="flex flex-wrap items-center gap-3 mb-1">
                <h1 className="text-2xl font-black text-slate-900">{order.order_no}</h1>
                <span className="text-sm text-slate-500">{order.customer_name}{order.buyer_po_no ? ` · PO ${order.buyer_po_no}` : ''} · first ship {fmtDate(order.first_ship_date)}{order.revision_no ? ` · rev ${order.revision_no}` : ''}</span>
                {me.menu['sales.orders'] && <Link to={`/v3/sales-orders/${order.id}`} className="text-sm font-semibold text-indigo-700 hover:underline">Open sales order</Link>}
                <span className="ml-auto flex gap-2">
                    <SecondaryButton onClick={() => exportExcel(data)} disabled={!data.items.length}><FileSpreadsheet size={14} /> Excel</SecondaryButton>
                    <SecondaryButton onClick={() => exportTrimReservationPdf(data, me?.user?.name)} disabled={!data.items.some(i => i.kind === 'TRIM')} title="Trims grouped by type and item, quantities merged — for the store to reserve"><FileDown size={14} /> Trim reservation PDF</SecondaryButton>
                    {perms.settings && approved && <SecondaryButton onClick={recalc} disabled={busy}><RefreshCw size={14} /> Recalculate</SecondaryButton>}
                </span>
            </div>
            {!approved && (
                <p className="my-2 text-sm font-semibold text-amber-700 flex items-center gap-1"><AlertTriangle size={14} />
                    {order.status === 'CANCELLED' ? 'This order is cancelled; its requirements are closed.' : 'Requirements are calculated when the order is approved.'}</p>
            )}
            <ErrorBox text={error} />

            {/* Readiness and the cutting gate */}
            {data.readiness && (() => {
                const r = data.readiness;
                return (
                    <div className="bg-white border border-slate-200 rounded-xl p-4 my-4 flex flex-wrap items-start gap-x-6 gap-y-2">
                        <div>
                            <p className="text-xs font-bold text-slate-500 mb-1">Readiness</p>
                            <ReadinessChip r={r} />
                            <p className="text-xs text-slate-500 mt-1">{READY_STATUS[r.status]?.hint}</p>
                        </div>
                        <div><p className="text-xs font-bold text-slate-500">Allocated</p><p className="font-black text-slate-900">{r.items_allocated} / {r.items_total} items</p></div>
                        {r.needed_by && <div><p className="text-xs font-bold text-slate-500">Materials needed by</p><p className={`font-semibold ${r.late ? 'text-rose-700' : 'text-slate-800'}`}>{fmtDate(r.needed_by)} <span className="text-xs font-normal">({daysText(r.days_to_needed_by)})</span></p></div>}
                        <div>
                            <p className="text-xs font-bold text-slate-500">Cutting</p>
                            <p className={`font-semibold ${r.cut_allowed ? 'text-emerald-700' : 'text-rose-700'}`}>{r.status === 'READY' ? 'Cleared — all materials in hand' : r.override ? 'Released by override' : 'Blocked until ready'}</p>
                        </div>
                        {r.override && (
                            <div className="basis-full text-sm bg-indigo-50 border border-indigo-200 text-indigo-900 rounded-lg px-3 py-2 flex flex-wrap items-center gap-2">
                                <ShieldCheck size={15} /> Released for cutting by {r.override.by_name || 'factory admin'} on {new Date(r.override.at).toLocaleString()}: {r.override.reason}
                                {r.override.stale && <span className="font-bold text-amber-700">· given before the order's latest revision</span>}
                                {perms.settings && <button type="button" className="ml-auto text-xs font-bold text-indigo-700 underline" onClick={() => { setFormError(''); setOv({ mode: 'revoke', reason: '' }); }}>Revoke</button>}
                            </div>
                        )}
                        {perms.settings && !r.override && r.status !== 'READY' && (
                            <div className="ml-auto"><SecondaryButton onClick={() => { setFormError(''); setOv({ mode: 'override', reason: '' }); }}><ShieldCheck size={14} /> Release for cutting…</SecondaryButton></div>
                        )}
                    </div>
                );
            })()}

            {/* Lines and their cut allowance */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto my-4">
                <table className="w-full text-sm min-w-[640px]">
                    <thead className="bg-slate-50 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                        <tr><th className="px-4 py-2">Line</th><th className="px-4 py-2">Style</th><th className="px-4 py-2">BOM</th><th className="px-4 py-2">Ship</th><th className="px-4 py-2 text-right">Ordered</th><th className="px-4 py-2 text-right">Cut allowance</th><th className="px-4 py-2 w-10" /></tr>
                    </thead>
                    <tbody>
                        {data.lines.map(l => (
                            <tr key={l.id} className={`border-t border-slate-100 ${l.status !== 'ACTIVE' ? 'opacity-50' : ''}`}>
                                <td className="px-4 py-2">{l.line_no}{l.status !== 'ACTIVE' && <span className="ml-1 text-xs text-rose-600">cancelled</span>}</td>
                                <td className="px-4 py-2 font-semibold">{l.style_code}</td>
                                <td className="px-4 py-2">v{l.bom_version}</td>
                                <td className="px-4 py-2">{fmtDate(l.ship_date)}</td>
                                <td className="px-4 py-2 text-right tabular-nums">{l.ordered_pieces.toLocaleString('en-IN')}</td>
                                <td className="px-4 py-2 text-right tabular-nums">{l.cut_allowance_pct != null ? `${l.cut_allowance_pct}%` : <span className="text-slate-400">{data.settings.default_cut_allowance_pct}% (default)</span>}</td>
                                <td className="px-4 py-2">
                                    {perms.plan && l.status === 'ACTIVE' && order.status !== 'CANCELLED' && (
                                        <button type="button" className="p-1 rounded text-slate-500 hover:bg-slate-100" aria-label={`Change cut allowance of line ${l.line_no}`}
                                            onClick={() => { setFormError(''); setAllowance({ line: l, pct: String(l.cut_allowance_pct ?? data.settings.default_cut_allowance_pct), reason: '' }); }}><Pencil size={14} /></button>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div className="flex gap-1 border-b border-slate-200 mb-4">
                {[['FABRIC', `Fabric (${data.totals.fabric_items})`], ['TRIM', `Trims (${data.totals.trim_items})`], ['CHANGES', `Changes (${data.changes.length + data.allocation_log.length})`], ...(approved ? [['MILESTONES', 'Milestones']] : [])].map(([k, label]) => (
                    <button key={k} type="button" onClick={() => setTab(k)}
                        className={`px-4 py-2 text-sm font-bold border-b-2 -mb-px ${tab === k ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>{label}</button>
                ))}
            </div>

            {tab === 'TRIM' && (
                <TrimStatusGrid data={data} approved={approved} canAct={canKind} orderId={order.id}
                    onAllocate={(it) => setTarget({ mode: 'allocate', orderId: order.id, orderNo: order.order_no, kind: it.kind, itemId: it.item_id, label: it.label, uom: it.uom, open: it.shortfall, allocated: it.allocated, free: it.free })}
                    onRelease={(it) => setTarget({ mode: 'release', orderId: order.id, orderNo: order.order_no, kind: it.kind, itemId: it.item_id, label: it.label, uom: it.uom, open: it.shortfall, allocated: it.allocated, free: it.free })} />
            )}

            {tab === 'FABRIC' && (
                shown.length === 0 ? <p className="text-sm text-slate-400">No {tab === 'FABRIC' ? 'fabric' : 'trim'} requirements.</p> : (
                    <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
                        <table className="border-collapse text-sm min-w-full">
                            <thead className="bg-slate-50">
                                <tr>
                                    <th className="px-3 py-2 text-left text-xs font-bold text-slate-500 min-w-[240px]">Item</th>
                                    {data.colours.map(c => <th key={c.id} className="px-3 py-2 text-right text-xs font-black text-slate-700 min-w-[90px]">{c.name}</th>)}
                                    <th className="px-3 py-2 text-right text-xs font-bold text-slate-500 min-w-[100px]">Total</th>
                                    {tab === 'TRIM' && <th className="px-3 py-2 text-right text-xs font-bold text-slate-500 min-w-[100px]">To buy in</th>}
                                    <th className="px-3 py-2 text-right text-xs font-bold text-slate-500 min-w-[120px]">Allocated</th>
                                    <th className="px-3 py-2 text-right text-xs font-bold text-slate-500 min-w-[100px]">Short</th>
                                    {anyKind && approved && <th className="px-3 py-2 w-40" />}
                                </tr>
                            </thead>
                            <tbody>
                                {shown.map(it => (
                                    <tr key={it.key} className="border-t border-slate-100 align-top">
                                        <td className="px-3 py-2">
                                            <p className="font-semibold text-slate-800">{it.label}{!it.active && <span className="ml-1 text-[10px] font-bold text-rose-600">inactive</span>}</p>
                                            <p className="text-xs text-slate-500">{it.usage.join(', ')}{it.issue_stages.length ? ` · issued at ${it.issue_stages.join(', ')}` : ''}</p>
                                        </td>
                                        {data.colours.map(c => (
                                            <td key={c.id} className="px-3 py-2 text-right tabular-nums">
                                                {it.by_colour[c.id] ? (
                                                    <button type="button" className="text-indigo-700 hover:underline" onClick={() => setCell({ item: it, colour: c })}>{fmt(it.by_colour[c.id], it.uom)}</button>
                                                ) : <span className="text-slate-300">—</span>}
                                            </td>
                                        ))}
                                        <td className="px-3 py-2 text-right font-black tabular-nums whitespace-nowrap">{fmt(it.required_display, it.uom)} <span className="text-xs font-normal text-slate-500">{it.uom}</span></td>
                                        {tab === 'TRIM' && <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{it.purchase_qty != null ? <>{fmt(it.purchase_qty, 'pcs')} <span className="text-xs text-slate-500">{it.purchase_uom}</span></> : '—'}</td>}
                                        <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                                            {fmt(it.allocated, it.uom)} <span className={`ml-1 text-[10px] font-bold px-1.5 py-0.5 rounded border ${COVER[it.cover][1]}`}>{COVER[it.cover][0]}</span>
                                            {it.issued > 0 && <span className="block text-[11px] font-semibold text-indigo-700">+ {fmt(it.issued, it.uom)} issued</span>}
                                            {it.kind === 'TRIM' && <span className="block text-[11px] text-slate-400">free {fmt(it.free, it.uom)}</span>}
                                        </td>
                                        <td className={`px-3 py-2 text-right tabular-nums font-bold ${it.shortfall > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>{it.shortfall > 0 ? fmt(it.shortfall, it.uom) : '—'}
                                            {it.pr_pending + it.pr_approved > 0 && <span className="block text-[11px] font-semibold text-slate-500">{fmt(it.pr_pending + it.pr_approved, it.uom)} on requisition{it.pr_approved > 0 ? ` (${fmt(it.pr_approved, it.uom)} approved)` : ''}</span>}
                                            {it.from_stock > 0 && <span className="block text-[11px] font-semibold text-emerald-700">{fmt(it.from_stock, it.uom)} in free stock — allocate</span>}
                                            {it.shortfall > 0 && it.to_raise > 0 && <span className="block text-[11px] font-semibold text-amber-700">{fmt(it.to_raise, it.uom)} still to raise</span>}</td>
                                        {anyKind && approved && (
                                            <td className="px-3 py-2 text-right whitespace-nowrap">{canKind(it.kind) && <>
                                                {it.to_raise > 0 && <Link to={`/v3/planning/buy-list?order=${order.id}&kind=${it.kind}`} className="text-xs font-bold text-amber-700 hover:underline mr-3">Raise</Link>}
                                                {it.shortfall > 0 && <button type="button" className="text-xs font-bold text-indigo-700 hover:underline mr-3"
                                                    onClick={() => setTarget({ mode: 'allocate', orderId: order.id, orderNo: order.order_no, kind: it.kind, itemId: it.item_id, label: it.label, uom: it.uom, open: it.shortfall, allocated: it.allocated, free: it.free })}>Allocate</button>}
                                                {it.allocated > 0 && <button type="button" className="text-xs font-bold text-slate-600 hover:underline"
                                                    onClick={() => setTarget({ mode: 'release', orderId: order.id, orderNo: order.order_no, kind: it.kind, itemId: it.item_id, label: it.label, uom: it.uom, open: it.shortfall, allocated: it.allocated, free: it.free })}>Release</button>}
                                            </>}</td>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )
            )}

            {tab === 'MILESTONES' && approved && <OrderMilestonesPanel orderId={orderId} canEdit={perms.plan} />}

            {tab === 'CHANGES' && (
                <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
                    <table className="w-full text-sm min-w-[720px]">
                        <thead className="bg-slate-50 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                            <tr><th className="px-4 py-2">When</th><th className="px-4 py-2">Why</th><th className="px-4 py-2">Item</th><th className="px-4 py-2 text-right">From</th><th className="px-4 py-2 text-right">To</th><th className="px-4 py-2">By</th></tr>
                        </thead>
                        <tbody>
                            {data.changes.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-400">No changes yet.</td></tr>}
                            {data.changes.map(c => (
                                <tr key={c.id} className="border-t border-slate-100">
                                    <td className="px-4 py-2 text-xs text-slate-500 whitespace-nowrap">{new Date(c.created_at).toLocaleString()}</td>
                                    <td className="px-4 py-2">{CAUSE[c.cause] || c.cause}{c.revision_no ? <span className="text-xs text-slate-500"> · rev {c.revision_no}</span> : null}</td>
                                    <td className="px-4 py-2">{c.item_label}</td>
                                    <td className="px-4 py-2 text-right tabular-nums">{fmt(c.old_qty, c.uom)}</td>
                                    <td className={`px-4 py-2 text-right tabular-nums font-semibold ${c.new_qty > c.old_qty ? 'text-emerald-700' : 'text-rose-700'}`}>{fmt(c.new_qty, c.uom)} <span className="text-xs font-normal text-slate-500">{c.uom}</span></td>
                                    <td className="px-4 py-2 text-slate-600">{c.user_name || ''}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {data.allocation_log.length > 0 && (
                        <div className="border-t border-slate-200 p-4 text-xs text-slate-600 space-y-1">
                            <p className="font-bold text-slate-500 uppercase tracking-wider">Allocation history</p>
                            {data.allocation_log.map(g => (
                                <p key={g.id}>{new Date(g.created_at).toLocaleString()} · <b>{ALLOC_ACTION[g.action] || g.action}</b> {fmt(g.qty, g.uom)} {g.uom} {g.item_label} (now {fmt(g.allocated_after, g.uom)})
                                    {g.reason ? ` — ${g.reason}` : ''}{g.user_name ? ` (${g.user_name})` : ''}</p>
                            ))}
                        </div>
                    )}
                    {data.log.length > 0 && (
                        <div className="border-t border-slate-200 p-4 text-xs text-slate-600 space-y-1">
                            <p className="font-bold text-slate-500 uppercase tracking-wider">Planning log</p>
                            {data.log.map(g => (
                                <p key={g.id}>{new Date(g.created_at).toLocaleString()} · <b>{g.action.replace('_', ' ').toLowerCase()}</b>
                                    {g.line_no ? ` · line ${g.line_no}` : ''}{g.detail?.from != null ? `: ${g.detail.from}% → ${g.detail.to}%` : ''}
                                    {g.reason ? ` — ${g.reason}` : ''}{g.user_name ? ` (${g.user_name})` : ''}</p>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {ov && (
                <Modal title={ov.mode === 'override' ? `Release ${order.order_no} for cutting` : 'Revoke the release'} onClose={() => setOv(null)}>
                    <div className="space-y-3 w-[min(460px,85vw)]">
                        {ov.mode === 'override' && <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{data.readiness.items_total - data.readiness.items_allocated} of {data.readiness.items_total} items are not allocated from stock. Releasing lets cutting start anyway; it is logged with your name and reason.</p>}
                        <Field label="Reason *"><textarea className={`${inputCls} min-h-[80px]`} value={ov.reason} onChange={e => setOv({ ...ov, reason: e.target.value })} autoFocus /></Field>
                        <ErrorBox text={formError} />
                        <div className="flex justify-end gap-2">
                            <SecondaryButton onClick={() => setOv(null)}>Cancel</SecondaryButton>
                            <PrimaryButton onClick={saveOverride} busy={busy} disabled={busy || !ov.reason.trim()}>{ov.mode === 'override' ? 'Release for cutting' : 'Revoke'}</PrimaryButton>
                        </div>
                    </div>
                </Modal>
            )}

            {target && <AllocateModal target={target} onClose={() => setTarget(null)} onDone={() => { setTarget(null); load(); }} />}

            {cell && (
                <Modal title={`${cell.item.label} — ${cell.colour.name}`} onClose={() => setCell(null)}>
                    <div className="space-y-3 w-[min(760px,92vw)] max-h-[70vh] overflow-y-auto">
                        {cell.item.rows.filter(r => r.colour_id === cell.colour.id).map(r => (
                            <div key={r.id}>
                                <p className="text-sm font-bold text-slate-700">Line {r.line_no} · {r.style_code} · {r.bom_line} <span className="font-normal text-slate-500">(item chosen {SOURCE[r.source] || ''})</span></p>
                                <table className="w-full text-sm mt-1">
                                    <thead className="text-xs text-slate-500 text-right"><tr><th className="text-left py-1">Size</th><th className="py-1">Ordered</th><th className="py-1">Planned</th><th className="py-1">× per garment</th><th className="py-1">× wastage</th><th className="py-1">= Required</th></tr></thead>
                                    <tbody>
                                        {r.detail.map(d => (
                                            <tr key={d.size_id} className="border-t border-slate-100 text-right tabular-nums">
                                                <td className="text-left py-1 font-semibold">{d.size}</td><td>{d.ordered}</td><td>{d.planned}</td><td>{d.consumption} {cell.item.uom}</td><td>{d.wastage_pct}%</td><td className="font-semibold">{fmt(d.qty, 'm')} {cell.item.uom}</td>
                                            </tr>
                                        ))}
                                        <tr className="border-t-2 border-slate-200 text-right font-bold tabular-nums"><td className="text-left py-1">Total</td><td>{r.ordered_pieces}</td><td>{r.planned_pieces}</td><td /><td /><td>{fmt(r.required_qty, 'm')} {cell.item.uom}</td></tr>
                                    </tbody>
                                </table>
                            </div>
                        ))}
                        <p className="text-xs text-slate-500">Planned = ordered + the line's cut allowance, rounded up per size. Required = planned × consumption × (1 + wastage).</p>
                    </div>
                </Modal>
            )}

            {allowance && (
                <Modal title={`Cut allowance — line ${allowance.line.line_no} (${allowance.line.style_code})`} onClose={() => setAllowance(null)}>
                    <div className="space-y-3 w-[min(440px,85vw)]">
                        <Field label="Cut allowance %" hint="Extra pieces planned on top of the ordered quantity. Requirements recalculate at once.">
                            <input className={inputCls} type="number" min="0" max="50" step="0.5" value={allowance.pct} onChange={e => setAllowance({ ...allowance, pct: e.target.value })} autoFocus />
                        </Field>
                        <Field label="Reason *"><input className={inputCls} value={allowance.reason} onChange={e => setAllowance({ ...allowance, reason: e.target.value })} /></Field>
                        <ErrorBox text={formError} />
                        <div className="flex justify-end gap-2">
                            <SecondaryButton onClick={() => setAllowance(null)}>Cancel</SecondaryButton>
                            <PrimaryButton onClick={saveAllowance} busy={busy} disabled={busy || allowance.pct === '' || !allowance.reason.trim()}>Save</PrimaryButton>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
}

// One approved order's material requirements (the Order BOM): fabric and trims (MaterialRequirements), the
// calculation behind every number, the cut allowance per order line, and the change log. Numbers come from
// requirementsEngine.js and update automatically when the order changes.
// Layout (16 Oct 2026): one compact header — order facts, readiness chips, the order lines as chips (folded when
// more than 3), one Download menu and a "⋯" menu (Recalculate); a sticky tab bar carrying the tab's filter and view.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import OrderTabs from '../orders/OrderTabs';
import { Pencil, FileDown, AlertTriangle, ShieldCheck, MoreHorizontal, ChevronDown } from 'lucide-react';
import * as XLSX from 'xlsx';
import Modal from '../../shared/Modal';
import { planningApi } from '../api/planningApi';
import { apiError } from '../api/mastersApi';
import { Field, inputCls, PrimaryButton, SecondaryButton, ErrorBox, Loading } from '../components/ui';
import { fmtDate } from '../salesOrders/SalesOrderStatusBadge';
import AllocateModal from './AllocateModal';
import RollAssignModal from './RollAssignModal';
import ReleaseForCuttingModal from './ReleaseForCuttingModal';
import OrderMilestonesPanel from './OrderMilestonesPanel';
import MaterialRequirements from './MaterialRequirements';
import { exportTrimReservationPdf } from './trimReservationPdf';
import { downloadOrderBomV2 } from '../boms/bomV2';
import { loadLetterhead, sheetWithLetterhead } from '../components/letterhead';
import { useV3Access } from '../V3Access';
import { ReadinessChip, READY_STATUS, daysText } from './readinessShared';

const fmt = (n, uom) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: uom === 'pcs' ? 0 : 2 });
const SOURCE = { EXACT: 'exact colour', TONE: 'by tone', ALL: 'all colours' };
const ALLOC_ACTION = { ALLOCATE: 'Allocated', RELEASE: 'Released', AUTO_RELEASE: 'Released automatically', ISSUE: 'Issued to production', ISSUE_RETURN: 'Returned from production' };
const CAUSE = { APPROVED: 'Approved', REVISED: 'Order revised', BOM_CHANGED: 'BOM changed', CANCELLED: 'Order cancelled', ALLOWANCE_CHANGED: 'Allowance changed', RECALCULATED: 'Recalculated' };

// A button that opens a small menu: items = [{ label, hint, run, disabled }] (null = a divider).
function MenuButton({ children, items, title, align = 'right' }) {
    const [open, setOpen] = useState(false);
    const box = useRef(null);
    useEffect(() => {
        if (!open) return undefined;
        const close = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, [open]);
    return (
        <span ref={box} className="relative inline-block">
            <SecondaryButton onClick={() => setOpen(o => !o)} title={title}>{children}</SecondaryButton>
            {open && (
                <div className={`absolute ${align === 'right' ? 'right-0' : 'left-0'} z-30 mt-1 w-72 rounded-lg border border-slate-200 bg-white p-1 shadow-lg`}>
                    {items.map((it, i) => (it === null ? <div key={i} className="my-1 border-t border-slate-100" /> : (
                        <button key={i} type="button" disabled={it.disabled} onClick={() => { setOpen(false); it.run(); }} className="block w-full rounded px-3 py-1.5 text-left hover:bg-slate-50 disabled:opacity-40">
                            <span className="block text-sm font-semibold text-slate-800">{it.label}</span>
                            {it.hint && <span className="block text-[11px] text-slate-500">{it.hint}</span>}
                        </button>
                    )))}
                </div>
            )}
        </span>
    );
}

function exportExcel(data, lh = null) {
    const wb = XLSX.utils.book_new();
    const grid = data.items.map(it => ({
        Type: it.kind === 'FABRIC' ? 'Fabric' : 'Trim', Item: it.label, 'Used as': it.usage.join(', '), Unit: it.uom,
        ...Object.fromEntries(data.colours.map(c => [c.name, it.by_colour[c.id] ? Number(it.by_colour[c.id]) : ''])),
        Required: it.required_display, Allocated: it.allocated, Issued: it.issued || 0, Shortfall: it.shortfall, 'On requisition': it.pr_pending + it.pr_approved, 'Still to raise': it.to_raise, 'Purchase qty': it.purchase_qty ?? '', 'Purchase unit': it.purchase_uom || '',
    }));
    XLSX.utils.book_append_sheet(wb, sheetWithLetterhead(XLSX, grid, lh, 'ORDER BOM'), 'Requirements');
    const calc = [];
    for (const it of data.items) for (const r of it.rows) for (const d of r.detail) {
        calc.push({ Item: it.label, Unit: it.uom, Line: r.line_no, Style: r.style_code, 'BOM line': r.bom_line, Colour: r.colour, From: SOURCE[r.source] || '',
            Size: d.size, Ordered: d.ordered, Planned: d.planned, 'Consumption / garment': d.consumption, 'Wastage %': d.wastage_pct, Required: d.qty });
    }
    XLSX.utils.book_append_sheet(wb, sheetWithLetterhead(XLSX, calc, lh, 'ORDER BOM'), 'Calculation');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.changes.map(c => ({
        When: new Date(c.created_at).toLocaleString('en-IN'), Why: CAUSE[c.cause] || c.cause, Revision: c.revision_no || '', Item: c.item_label, Unit: c.uom, From: c.old_qty, To: c.new_qty, By: c.user_name || '',
    }))), 'Changes');
    XLSX.writeFile(wb, `Requirements-${data.order.order_no.replace(/[^\w-]+/g, '-')}.xlsx`);
}

export default function OrderRequirementsPage() {
    const { me } = useV3Access();
    const { orderId } = useParams();
    const [data, setData] = useState(null);
    const [perms, setPerms] = useState({ plan: false, settings: false, release: false });
    // Raise: the merchandiser for all material, each store for its own kind. Allocate / release (19 Oct 2026, "not
    // merchandiser but store manager allocate trim and fabric store manager allocate fabric"): the store only.
    const myKinds = perms.plan_kinds || (perms.plan ? ['FABRIC', 'TRIM'] : []);
    const allocKinds = perms.alloc_kinds || [];
    const canRaise = (k) => myKinds.includes(k);
    const canAlloc = (k) => allocKinds.includes(k);
    const [params] = useSearchParams();
    const [tab, setTab] = useState(['MILESTONES', 'TRIM'].includes(params.get('tab')) ? params.get('tab') : 'FABRIC');
    const [error, setError] = useState('');
    const [cell, setCell] = useState(null);           // drill-down { item, colour }
    const [fabFilter, setFabFilter] = useState('all'); // Fabric / Trims tab: all / short / covered
    const [fabView, setFabView] = useState('list');    // Fabric / Trims tab: list / colour (matrix)
    const [linesOpen, setLinesOpen] = useState(false); // more than 3 order lines: folded
    const [allowance, setAllowance] = useState(null); // { line, pct, reason }
    const [target, setTarget] = useState(null);       // allocate / release
    const [rolls, setRolls] = useState(null);         // fabric: assign / un-assign whole rolls
    const [ov, setOv] = useState(null);               // revoke the release { mode, reason }
    const [releasing, setReleasing] = useState(false); // release for cutting (PPM per line + undertaking)
    const [check, setCheck] = useState(null);         // release check: items on no requisition and no PO
    const [busy, setBusy] = useState(false);
    const [formError, setFormError] = useState('');

    const load = useCallback(() => planningApi.requirements(orderId).then(res => setData(res.data))
        .catch(err => setError(apiError(err, 'Failed to load requirements.'))), [orderId]);
    const loadCheck = useCallback(() => planningApi.releaseCheck(orderId).then(res => setCheck(res.data)).catch(() => {}), [orderId]);
    useEffect(() => {
        load(); loadCheck();
        planningApi.permissions().then(res => setPerms(res.data)).catch(() => {});
    }, [load, loadCheck]);

    if (!data) return <div>{error ? <ErrorBox text={error} /> : <Loading />}</div>;
    const { order } = data;
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
            const res = await planningApi.revokeOverride(orderId, ov.reason);
            setData(res.data); setOv(null);
        } catch (err) { setFormError(apiError(err, 'Failed.')); } finally { setBusy(false); }
    };
    // Every item of the tab's kind takes what it still needs from free stock (one transaction on the server).
    const allocateFree = async () => {
        const kindName = tab === 'FABRIC' ? 'fabric' : 'trims';
        const n = data.items.filter(i => i.kind === tab && i.shortfall > 0 && i.free > 0).length;
        if (!window.confirm(`Allocate free stock to ${order.order_no} for ${n} ${kindName} item${n === 1 ? '' : 's'}? Each takes what it still needs, as far as free stock goes.`)) return;
        setBusy(true); setError('');
        try {
            const res = await planningApi.allocateFree(orderId, tab);
            setData(res.data);
            window.alert(`Allocated: ${res.data.allocated_now.map(a => `${a.label} ${fmt(a.qty, a.uom)} ${a.uom}`).join('; ')}`);
        } catch (err) { setError(apiError(err, 'Failed to allocate.')); } finally { setBusy(false); }
    };
    const recalc = async () => {
        if (!window.confirm('Recalculate this order\'s requirements from its lines and BOMs now? (Normally automatic; this is a repair tool.)')) return;
        setBusy(true); setError('');
        try { setData((await planningApi.recalculate(orderId, 'Manual recalculation')).data); } catch (err) { setError(apiError(err, 'Failed to recalculate.')); } finally { setBusy(false); }
    };

    return (
        <div>
            <OrderTabs orderId={orderId} active={tab === 'MILESTONES' ? 'milestones' : 'materials'} />
            <ErrorBox text={error} />

            {/* Compact header: order facts · readiness chips · menus; then the order lines as chips */}
            <div className="bg-white border border-slate-200 rounded-xl px-4 py-2.5 mb-3 space-y-2">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                    <h1 className="text-xl font-black text-slate-900">{order.order_no}</h1>
                    <span className="text-sm text-slate-500">{order.customer_name}{order.buyer_po_no ? ` · PO ${order.buyer_po_no}` : ''} · first ship {fmtDate(order.first_ship_date)}{order.revision_no ? ` · rev ${order.revision_no}` : ''}</span>
                    {me.menu['sales.orders'] && <Link to={`/v3/sales-orders/${order.id}`} className="text-sm font-semibold text-indigo-700 hover:underline">Open sales order</Link>}
                    {data.readiness && (() => {
                        const r = data.readiness;
                        return <>
                            <span title={READY_STATUS[r.status]?.hint}><ReadinessChip r={r} /></span>
                            <span className="text-xs font-bold text-slate-600 bg-slate-100 rounded px-1.5 py-0.5">{r.items_allocated}/{r.items_total} allocated</span>
                            {r.needed_by && <span className={`text-xs font-bold rounded px-1.5 py-0.5 ${r.late ? 'bg-rose-50 text-rose-700' : 'bg-slate-100 text-slate-600'}`}>needed by {fmtDate(r.needed_by)} ({daysText(r.days_to_needed_by)})</span>}
                            <span className={`text-xs font-bold rounded px-1.5 py-0.5 ${r.cut_allowed ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}
                                title={r.override ? `Released by ${r.override.by_name || '—'} on ${new Date(r.override.at).toLocaleString()}: ${r.override.reason}${r.override.stale ? ' (given before the latest revision)' : ''}` : undefined}>
                                {r.override ? <><ShieldCheck size={11} className="inline -mt-0.5" /> cutting released{r.override.stale ? ' (old)' : ''}</> : r.status === 'READY' ? 'cutting cleared' : 'cutting blocked'}
                            </span>
                            {perms.release && !r.override && r.status !== 'READY' && <button type="button" className="text-xs font-bold text-indigo-700 hover:underline" onClick={() => setReleasing(true)}>Release for cutting…</button>}
                            {perms.release && r.override && <button type="button" className="text-xs font-bold text-slate-600 hover:underline" onClick={() => { setFormError(''); setOv({ mode: 'revoke', reason: '' }); }}>Revoke release</button>}
                        </>;
                    })()}
                    {!approved && <span className="text-xs font-bold text-amber-700 flex items-center gap-1"><AlertTriangle size={12} />{order.status === 'CANCELLED' ? 'Cancelled — requirements closed' : 'Calculated when the order is approved (estimate)'}</span>}
                    <span className="ml-auto flex gap-2">
                        <MenuButton title="Downloads" items={[
                            { label: 'Order BOM PDF — detailed', hint: 'Every garment colour on its own row', run: () => downloadOrderBomV2(planningApi, order.id, 'pdf', { summary: false }).catch(err => setError(apiError(err, err.message || 'Failed to make the Order BOM.'))) },
                            { label: 'Order BOM PDF — summary', hint: 'MATCH TO COLOR / BY SIZE / DTM rows', run: () => downloadOrderBomV2(planningApi, order.id, 'pdf', { summary: true }).catch(err => setError(apiError(err, err.message || 'Failed to make the Order BOM.'))) },
                            { label: 'Order BOM Excel — detailed', run: () => downloadOrderBomV2(planningApi, order.id, 'xlsx', { summary: false }).catch(err => setError(apiError(err, err.message || 'Failed to make the Order BOM.'))) },
                            { label: 'Order BOM Excel — summary', run: () => downloadOrderBomV2(planningApi, order.id, 'xlsx', { summary: true }).catch(err => setError(apiError(err, err.message || 'Failed to make the Order BOM.'))) },
                            null,
                            { label: 'Requirements Excel', hint: 'Items × colours, the calculation per size, the change log', disabled: !data.items.length, run: async () => exportExcel(data, await loadLetterhead()) },
                            { label: 'Trim reservation PDF', hint: 'Trims by type and item, for the store to reserve', disabled: !data.items.some(i => i.kind === 'TRIM'), run: () => exportTrimReservationPdf(data, me?.user?.name) },
                        ]}><FileDown size={14} /> Download <ChevronDown size={13} /></MenuButton>
                        {perms.settings && approved && <MenuButton title="More" items={[{ label: 'Recalculate', hint: 'Repair tool — requirements are normally recalculated by themselves', run: recalc }]}><MoreHorizontal size={15} /></MenuButton>}
                    </span>
                </div>
                {/* Order lines as chips: style · Style BOM · ship · pieces · cut allowance (pencil edits it) */}
                <div className="flex flex-wrap items-center gap-1.5">
                    {(data.lines.length > 3 && !linesOpen ? [] : data.lines).map(l => (
                        <span key={l.id} className={`inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 text-xs ${l.status !== 'ACTIVE' ? 'border-slate-200 text-slate-400 line-through' : 'border-slate-200 text-slate-700 bg-slate-50'}`}>
                            <b className="text-slate-800">L{l.line_no}</b> · {l.style_code} · {l.bom_version ? `BOM v${l.bom_version}` : <span className="font-semibold text-amber-700">BOM pending</span>} · ship {fmtDate(l.ship_date)} · {l.ordered_pieces.toLocaleString('en-IN')} pcs · cut {l.cut_allowance_pct != null ? `${l.cut_allowance_pct}%` : `${data.settings.default_cut_allowance_pct}% (default)`}
                            {perms.plan && l.status === 'ACTIVE' && order.status !== 'CANCELLED' && (
                                <button type="button" className="ml-0.5 rounded p-0.5 text-slate-500 hover:bg-slate-200" aria-label={`Change cut allowance of line ${l.line_no}`} title="Change the cut allowance"
                                    onClick={() => { setFormError(''); setAllowance({ line: l, pct: String(l.cut_allowance_pct ?? data.settings.default_cut_allowance_pct), reason: '' }); }}><Pencil size={11} /></button>
                            )}
                        </span>
                    ))}
                    {data.lines.length > 3 && <button type="button" className="text-xs font-bold text-indigo-700 hover:underline" onClick={() => setLinesOpen(o => !o)}>{linesOpen ? 'Hide lines' : `Lines (${data.lines.length}) ▸`}</button>}
                </div>
            </div>

            {approved && check?.unplanned?.length > 0 && data.readiness?.status !== 'READY' && (
                <div className="mb-3 rounded-xl border-2 border-rose-300 bg-rose-50 px-4 py-2 text-sm text-rose-800">
                    <p className="font-black flex items-center gap-1.5"><AlertTriangle size={15} />{check.unplanned.length} item{check.unplanned.length === 1 ? ' is' : 's are'} on no requisition and no purchase order</p>
                    <p className="text-xs mt-0.5">{check.unplanned.slice(0, 6).map(u => `${u.label} (${fmt(u.to_raise, u.uom)} ${u.uom})`).join(' · ')}{check.unplanned.length > 6 ? ` · and ${check.unplanned.length - 6} more` : ''} — raise them before cutting needs them.</p>
                </div>
            )}

            {/* Sticky tab bar; the Fabric / Trims tabs carry their filter and view on the right */}
            <div className="sticky top-14 z-20 -mx-1 px-1 bg-slate-50 flex flex-wrap items-end gap-1 border-b border-slate-200 mb-3">
                {[['FABRIC', `Fabric (${data.totals.fabric_items}${data.items.some(i => i.kind === 'FABRIC' && i.shortfall > 0) ? ` · ${data.items.filter(i => i.kind === 'FABRIC' && i.shortfall > 0).length} short` : ''})`],
                    ['TRIM', `Trims (${data.totals.trim_items}${data.items.some(i => i.kind === 'TRIM' && i.shortfall > 0) ? ` · ${data.items.filter(i => i.kind === 'TRIM' && i.shortfall > 0).length} short` : ''})`],
                    ['CHANGES', `Changes (${data.changes.length + data.allocation_log.length})`], ...(approved ? [['MILESTONES', 'Milestones']] : [])].map(([k, label]) => (
                    <button key={k} type="button" onClick={() => setTab(k)}
                        className={`px-4 py-2 text-sm font-bold border-b-2 -mb-px ${tab === k ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>{label}</button>
                ))}
                {(tab === 'FABRIC' || tab === 'TRIM') && (
                    <span className="ml-auto mb-1.5 flex flex-wrap items-center gap-2">
                        <span className="inline-flex rounded-lg border border-slate-300 overflow-hidden text-xs font-bold">
                            {[['all', 'All'], ['short', 'Short'], ['covered', 'Covered']].map(([k, l]) => (
                                <button key={k} type="button" onClick={() => setFabFilter(k)} className={`px-2.5 py-1 ${fabFilter === k ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>{l}</button>
                            ))}
                        </span>
                        <span className="inline-flex rounded-lg border border-slate-300 overflow-hidden text-xs font-bold">
                            {[['list', 'List'], ['colour', 'By colour']].map(([k, l]) => (
                                <button key={k} type="button" onClick={() => setFabView(k)} className={`px-2.5 py-1 ${fabView === k ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>{l}</button>
                            ))}
                        </span>
                    </span>
                )}
            </div>

            {(tab === 'FABRIC' || tab === 'TRIM') && (
                <MaterialRequirements key={tab} data={data} kind={tab} approved={approved} showActions={(myKinds.length > 0 || allocKinds.length > 0) && approved} canRaise={canRaise} canAlloc={canAlloc} busy={busy}
                    filter={fabFilter} view={fabView}
                    onCell={(item, colour) => setCell({ item, colour })}
                    onAllocateFree={allocateFree}
                    onRolls={(it) => setRolls({ orderId: order.id, orderNo: order.order_no, itemId: it.item_id, label: it.label })}
                    onAllocate={(it) => setTarget({ mode: 'allocate', orderId: order.id, orderNo: order.order_no, kind: it.kind, itemId: it.item_id, label: it.label, uom: it.uom, open: it.shortfall, allocated: it.allocated, free: it.free })}
                    onRelease={(it) => setTarget({ mode: 'release', orderId: order.id, orderNo: order.order_no, kind: it.kind, itemId: it.item_id, label: it.label, uom: it.uom, open: it.shortfall, allocated: it.allocated, free: it.free })} />
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
                <Modal title="Revoke the release" onClose={() => setOv(null)}>
                    <div className="space-y-3 w-[min(460px,85vw)]">
                        <Field label="Reason *"><textarea className={`${inputCls} min-h-[80px]`} value={ov.reason} onChange={e => setOv({ ...ov, reason: e.target.value })} autoFocus /></Field>
                        <ErrorBox text={formError} />
                        <div className="flex justify-end gap-2">
                            <SecondaryButton onClick={() => setOv(null)}>Cancel</SecondaryButton>
                            <PrimaryButton onClick={saveOverride} busy={busy} disabled={busy || !ov.reason.trim()}>Revoke</PrimaryButton>
                        </div>
                    </div>
                </Modal>
            )}

            {releasing && <ReleaseForCuttingModal order={order} readiness={data.readiness} onClose={() => { setReleasing(false); loadCheck(); }} onDone={(d) => { setData(d); setReleasing(false); loadCheck(); }} />}
            {rolls && <RollAssignModal target={rolls} canAssign={canAlloc('FABRIC')} onClose={() => setRolls(null)} onDone={(msg) => { setRolls(null); load(); loadCheck(); window.alert(msg); }} />}
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

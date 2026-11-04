// Issue fabric (4 Nov 2026: fabric only; trim slips are under Trim kits). The store's worklist: every approved order, flagged for the
// cutting gate, with the fabric still to send; an order leaves once its fabric report is approved and acknowledged. Fabric slips by status, grouped per sales
// order (collapsed, with its summary; its slips open under it), with filters, totals and Excel / PDF. To receive: the cutting manager's slips. Reports: fabric at cutting, time to receive.
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { FileSpreadsheet, FileText, AlertTriangle, ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react';
import { materialIssueApi } from '../api/materialIssueApi';
import { apiError } from '../api/mastersApi';
import { PageHeader, SearchInput, SecondaryButton, ErrorBox, Loading, inputCls } from '../components/ui';
import { fmtDate, todayLocal } from '../salesOrders/SalesOrderStatusBadge';
import { loadLetterhead } from '../components/letterhead';
import { STATUS, unitsText, tookText, when, fmtN, exportSlipsExcel, exportSlipsPdf } from './issuePrint';

const PAGE = 50;
const REPORT = { TO_APPROVE: 'Fabric report: to approve', SENT_BACK: 'Fabric report: sent back', TO_ACKNOWLEDGE: 'Fabric report: with accounts' };
const EXPORT_LIMIT = 5000;
const GROUPS = [['', 'All'], ['SUBMITTED', 'Waiting for cutting'], ['DRAFT', 'Drafts'], ['RECEIVED', 'Received'], ['REJECTED', 'Refused'], ['CANCELLED', 'Cancelled']];
const TH = 'px-3 py-2.5';
const Th = ({ children, right }) => <th className={`${TH} ${right ? 'text-right' : ''}`}>{children}</th>;
const Badge = ({ status }) => { const b = STATUS[status] || {}; return <span className={`inline-block text-[11px] font-black px-2 py-0.5 rounded border whitespace-nowrap ${b.cls || ''}`}>{b.label || status}</span>; };
const Flag = ({ tone = 'amber', children, title }) => <span title={title} className={`inline-block text-[11px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap ${tone === 'rose' ? 'bg-rose-50 text-rose-700' : tone === 'slate' ? 'bg-slate-100 text-slate-600' : 'bg-amber-50 text-amber-800'}`}>{children}</span>;
const when2 = (d) => (d ? new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');

// One slip, read from the row: status and flags · order and batch · fabric and lots · rolls · quantity · sent · received.
function SlipRow({ s, action, inGroup }) {
    const fabrics = (s.fabrics || '').split(', ').filter(Boolean);
    const done = s.status === 'RECEIVED' || s.status === 'REJECTED';
    return (
        <tr className={`border-t border-slate-100 align-top ${s.status === 'CANCELLED' ? 'opacity-60' : ''}`}>
            <td className={TH}>
                <Link to={`/v3/material-issue/issues/${s.id}`} className="font-bold text-indigo-700 hover:underline whitespace-nowrap">{s.issue_no}</Link>
                <div className="mt-1"><Badge status={s.status} /></div>
            </td>
            {inGroup ? <td className={`${TH} text-xs text-slate-600`}>{fmtDate(s.issue_date)}{s.batch_code && <span className="block text-slate-500">Batch {s.batch_code}</span>}</td> : (
                <td className={TH}>
                    <span className="font-semibold">{s.order_no}</span>
                    <span className="block text-xs text-slate-500">{s.customer_name}</span>
                    {s.batch_code && <span className="block text-xs text-slate-500">Batch {s.batch_code}</span>}
                </td>
            )}
            <td className={TH}>
                {fabrics.length === 0 ? <span className="text-slate-400">—</span> : <span className="font-medium">{fabrics[0]}{fabrics.length > 1 && <span className="text-xs text-slate-500" title={fabrics.slice(1).join(', ')}> +{fabrics.length - 1} more</span>}</span>}
                <span className="block text-xs text-slate-500">{(s.lots || []).length ? `Lot ${s.lots.join(', ')}` : 'Lot not recorded'}</span>
                <div className="mt-0.5 flex flex-wrap gap-1">
                    {(s.slip_mixed_lots || s.mixed_lots) && <Flag>mixed lots</Flag>}
                    {s.gate_override && <Flag tone="rose" title={s.gate_release_reason || ''}>gate released{s.gate_released_by ? ` by ${s.gate_released_by}` : ''}</Flag>}
                    {s.backdate_reason && <Flag title={s.backdate_reason}>dated in the past</Flag>}
                    {s.has_returns && <Flag tone="slate">with returns</Flag>}
                    {s.notes && <Flag tone="slate" title={s.notes}>note</Flag>}
                </div>
            </td>
            <td className={`${TH} text-right tabular-nums`}><b>{s.rolls}</b>{s.rolls_refused > 0 && <span className="block text-[11px] font-bold text-rose-700">{s.rolls_refused} refused</span>}</td>
            <td className={`${TH} text-right tabular-nums font-bold whitespace-nowrap`}>{unitsText(s.totals)}</td>
            <td className={`${TH} text-xs`}>
                <span className="block font-semibold text-slate-700">{s.submitted_by_name || s.issued_by_name || '—'}</span>
                <span className="text-slate-500">{s.submitted_at ? when2(s.submitted_at) : fmtDate(s.issue_date)}</span>
            </td>
            <td className={`${TH} text-xs`}>
                {action || (done ? <><span className="block font-semibold text-slate-700">{s.received_by}</span><span className="text-slate-500">{s.received_at ? when2(s.received_at) : fmtDate(s.issue_date)}</span>{s.submitted_at && s.received_at && <span className="block text-slate-400">took {tookText(s.submitted_at, s.received_at)}</span>}</>
                    : s.status === 'SUBMITTED' ? <span className="font-semibold text-amber-700">Waiting {tookText(s.submitted_at, new Date())}</span>
                        : s.status === 'CANCELLED' ? <span className="text-slate-500" title={s.cancel_reason}>Cancelled</span> : <span className="text-slate-400">Not sent</span>)}
            </td>
        </tr>
    );
}

const SlipHead = () => <thead className="bg-slate-50 text-left text-xs font-bold text-slate-500 uppercase tracking-wider"><tr><Th>Slip</Th><Th>Order</Th><Th>Fabric</Th><Th right>Rolls</Th><Th right>Quantity</Th><Th>Sent</Th><Th>Received</Th></tr></thead>;

// One sales order's slips, loaded when its row is opened; they answer to the same filter as the groups.
function GroupSlips({ orderId, filter, group, setError }) {
    const [rows, setRows] = useState(null);
    useEffect(() => {
        let live = true;
        materialIssueApi.issues({ ...filter, order_id: orderId }).then(res => { if (live) setRows(res.data); }).catch(err => { if (live) setError(apiError(err, 'Failed to load the slips.')); });
        return () => { live = false; };
    }, [orderId, filter, setError]);
    if (!rows) return <div className="px-4 py-3"><Loading /></div>;
    return (
        <table className="w-full text-sm">
            <thead className="text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider"><tr><Th>Slip</Th><Th>Date</Th><Th>Fabric</Th><Th right>Rolls</Th><Th right>Quantity</Th><Th>Sent</Th><Th>Received</Th></tr></thead>
            <tbody>{rows.map(x => <SlipRow key={x.id} s={x} inGroup />)}</tbody>
            <tfoot className="border-t-2 border-slate-200 font-bold"><tr><td className={TH} colSpan={3}>Total · {rows.length} slip{rows.length === 1 ? '' : 's'}</td><td className={`${TH} text-right tabular-nums`}>{group.rolls}</td><td className={`${TH} text-right tabular-nums whitespace-nowrap`}>{unitsText(group.totals)}</td><td className={TH} colSpan={2} /></tr></tfoot>
        </table>
    );
}

function SlipsTab({ setError }) {
    const [params, setParams] = useSearchParams();
    const status = params.get('status') || '';
    const [search, setSearch] = useState('');
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');
    const [offset, setOffset] = useState(0);
    const [d, setD] = useState(null);
    const [open, setOpen] = useState(new Set());
    const [exporting, setExporting] = useState('');
    const filter = useMemo(() => ({ q: search.trim() || undefined, from: from || undefined, to: to || undefined, status: status || undefined }), [search, from, to, status]);
    useEffect(() => { setOffset(0); }, [filter]);
    useEffect(() => {
        let live = true;
        const t = setTimeout(() => materialIssueApi.issuesByOrder({ ...filter, limit: PAGE, offset }).then(res => { if (live) { setD(res.data); setError(''); } }).catch(err => { if (live) setError(apiError(err, 'Failed to load the slips.')); }), 250);
        return () => { live = false; clearTimeout(t); };
    }, [filter, offset, setError]);
    const setStatus = (k) => setParams(k ? { tab: 'slips', status: k } : { tab: 'slips' });
    const toggle = (id) => setOpen(prev => { const nx = new Set(prev); if (nx.has(id)) nx.delete(id); else nx.add(id); return nx; });
    const exportAll = async (kind) => {
        if (d.totals.slips > EXPORT_LIMIT) { setError(`${d.totals.slips} slips: too many to export at once. Narrow the dates (the limit is ${EXPORT_LIMIT}).`); return; }
        setExporting(kind); setError('');
        try {
            const { data } = await materialIssueApi.issues({ ...filter, limit: EXPORT_LIMIT });
            const byOrder = [...data].sort((a, b) => a.order_no.localeCompare(b.order_no) || Number(b.id) - Number(a.id));
            const info = { status: STATUS[status]?.label, search: search.trim(), from, to };
            if (kind === 'excel') await exportSlipsExcel(byOrder, info); else exportSlipsPdf(byOrder, info, await loadLetterhead());
        } catch (err) { setError(apiError(err, 'Failed to export.')); } finally { setExporting(''); }
    };
    const count = (k) => (k ? d?.totals.by_status?.[k] || 0 : Object.values(d?.totals.by_status || {}).reduce((a, n) => a + n, 0));
    const groups = d?.groups || [];
    const allOpen = groups.length > 0 && groups.every(g => open.has(g.order_id));
    return (
        <div>
            <div className="flex flex-wrap items-center gap-2 mb-2">
                {GROUPS.map(([k, label]) => <button key={k} type="button" aria-pressed={status === k} onClick={() => setStatus(k)} className={`px-3 py-1 rounded-full text-sm font-semibold border ${status === k ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-200 text-slate-600 hover:border-indigo-300'}`}>{label} <span className="tabular-nums">{count(k)}</span></button>)}
            </div>
            <div className="flex flex-wrap items-end gap-2 mb-3">
                <SearchInput value={search} onChange={setSearch} placeholder="Slip, order, receiver, roll, lot, fabric" />
                <label className="text-xs font-semibold text-slate-500">From<input type="date" className={inputCls} value={from} max={to || todayLocal()} onChange={e => setFrom(e.target.value)} /></label>
                <label className="text-xs font-semibold text-slate-500">To<input type="date" className={inputCls} value={to} min={from || undefined} max={todayLocal()} onChange={e => setTo(e.target.value)} /></label>
                <span className="ml-auto flex gap-2">
                    {groups.length > 0 && <SecondaryButton onClick={() => setOpen(allOpen ? new Set() : new Set(groups.map(g => g.order_id)))}>{allOpen ? 'Collapse all' : 'Open all'}</SecondaryButton>}
                    <SecondaryButton onClick={() => exportAll('excel')} disabled={!groups.length || !!exporting}><FileSpreadsheet size={14} /> {exporting === 'excel' ? 'Exporting…' : 'Excel'}</SecondaryButton>
                    <SecondaryButton onClick={() => exportAll('pdf')} disabled={!groups.length || !!exporting}><FileText size={14} /> {exporting === 'pdf' ? 'Exporting…' : 'PDF'}</SecondaryButton>
                </span>
            </div>
            {!d ? <Loading /> : (
                <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
                    <table className="w-full text-sm min-w-[1040px]">
                        <thead className="bg-slate-50 text-left text-xs font-bold text-slate-500 uppercase tracking-wider"><tr><Th>Sales order</Th><Th>Slips</Th><Th>Fabric</Th><Th right>Rolls</Th><Th right>Quantity</Th><th className={`${TH} whitespace-nowrap`}>Last activity</th></tr></thead>
                        <tbody>
                            {groups.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">No fabric slips here.</td></tr>}
                            {groups.map(g => {
                                const isOpen = open.has(g.order_id);
                                const late = g.ship_date && g.ship_date < todayLocal();
                                return (
                                    <Fragment key={g.order_id}>
                                        <tr className={`border-t border-slate-100 align-top cursor-pointer hover:bg-slate-50 ${isOpen ? 'bg-indigo-50/40' : ''}`} onClick={() => toggle(g.order_id)}>
                                            <td className={TH}>
                                                <button type="button" aria-expanded={isOpen} className="inline-flex items-start gap-1 font-bold text-slate-900 text-left whitespace-nowrap" onClick={(e) => { e.stopPropagation(); toggle(g.order_id); }}>
                                                    {isOpen ? <ChevronDown size={15} className="mt-0.5 shrink-0" /> : <ChevronRight size={15} className="mt-0.5 shrink-0" />}{g.order_no}
                                                </button>
                                                <span className="block pl-5 text-xs text-slate-500">{g.customer_name}</span>
                                                {g.ship_date && <span className={`block pl-5 text-xs ${late ? 'font-bold text-rose-700' : 'text-slate-500'}`}>Ships {fmtDate(g.ship_date)}</span>}
                                            </td>
                                            <td className={TH}>
                                                <b className="tabular-nums">{g.slips}</b>
                                                <div className="mt-0.5 flex flex-wrap gap-1">
                                                    {g.waiting > 0 && <Flag>{g.waiting} waiting for cutting</Flag>}
                                                    {g.drafts > 0 && <Flag tone="slate">{g.drafts} draft{g.drafts === 1 ? '' : 's'}</Flag>}
                                                    {g.received > 0 && <span className="inline-block text-[11px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap bg-emerald-50 text-emerald-800">{g.received} received</span>}
                                                    {g.refused > 0 && <Flag tone="rose">{g.refused} refused</Flag>}
                                                    {g.cancelled > 0 && <Flag tone="slate">{g.cancelled} cancelled</Flag>}
                                                </div>
                                            </td>
                                            <td className={TH}>
                                                {g.fabrics.length === 0 ? <span className="text-slate-400">—</span> : <span className="font-medium">{g.fabrics[0]}{g.fabrics.length > 1 && <span className="text-xs text-slate-500" title={g.fabrics.slice(1).join(', ')}> +{g.fabrics.length - 1} more</span>}</span>}
                                                <span className="block text-xs text-slate-500">{g.lots.length ? `Lot ${g.lots.join(', ')}` : 'Lot not recorded'}</span>
                                                <div className="mt-0.5 flex flex-wrap gap-1">
                                                    {g.mixed_lots && <Flag>mixed lots</Flag>}
                                                    {g.gate_override && <Flag tone="rose">gate released</Flag>}
                                                    {g.backdated && <Flag>dated in the past</Flag>}
                                                </div>
                                            </td>
                                            <td className={`${TH} text-right tabular-nums`}><b>{g.rolls}</b>{g.rolls_refused > 0 && <span className="block text-[11px] font-bold text-rose-700">{g.rolls_refused} refused</span>}</td>
                                            <td className={`${TH} text-right tabular-nums font-bold whitespace-nowrap`}>{unitsText(g.totals)}</td>
                                            <td className={`${TH} text-xs text-slate-500 whitespace-nowrap`}>{when2(g.last_at)}</td>
                                        </tr>
                                        {isOpen && <tr className="bg-slate-50/60"><td colSpan={6} className="px-3 pb-3"><div className="bg-white border border-slate-200 rounded-lg overflow-x-auto"><GroupSlips orderId={g.order_id} filter={filter} group={g} setError={setError} /></div></td></tr>}
                                    </Fragment>
                                );
                            })}
                        </tbody>
                        {d.totals.slips > 0 && <tfoot className="bg-slate-50 border-t-2 border-slate-200 font-black"><tr><td className={TH}>Total · {d.total_groups} order{d.total_groups === 1 ? '' : 's'}</td><td className={TH}>{d.totals.slips} slip{d.totals.slips === 1 ? '' : 's'}</td><td className={`${TH} text-xs font-normal text-slate-500`}>all pages; cancelled and refused count nothing</td><td className={`${TH} text-right tabular-nums`}>{d.totals.rolls}</td><td className={`${TH} text-right tabular-nums whitespace-nowrap`}>{unitsText(d.totals.units)}</td><td /></tr></tfoot>}
                    </table>
                    {d.total_groups > PAGE && (
                        <div className="flex items-center justify-end gap-2 px-3 py-2 border-t border-slate-100 text-sm text-slate-600">
                            {offset + 1}–{Math.min(offset + PAGE, d.total_groups)} of {d.total_groups} orders
                            <button type="button" aria-label="Previous page" className="p-1 rounded border border-slate-200 disabled:opacity-40" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}><ChevronLeft size={15} /></button>
                            <button type="button" aria-label="Next page" className="p-1 rounded border border-slate-200 disabled:opacity-40" disabled={offset + PAGE >= d.total_groups} onClick={() => setOffset(offset + PAGE)}><ChevronRight size={15} /></button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

function OrdersTab({ setError }) {
    const [orders, setOrders] = useState(null);
    const [search, setSearch] = useState('');
    const [gateIs, setGateIs] = useState('');
    const today = todayLocal();
    useEffect(() => { materialIssueApi.orders().then(res => { setOrders(res.data); setError(''); }).catch(err => setError(apiError(err, 'Failed to load orders.'))); }, [setError]);
    const q = search.trim().toLowerCase();
    const found = (orders || []).filter(o => !q || o.order_no.toLowerCase().includes(q) || o.customer_name.toLowerCase().includes(q));
    const stateOf = (o) => (!o.gate.allowed ? 'CLOSED' : o.gate.ready ? 'OPEN' : 'RELEASED');
    const shown = found.filter(o => !gateIs || stateOf(o) === gateIs);
    if (!orders) return <Loading />;
    return (
        <div>
            <div className="flex flex-wrap items-center gap-2 mb-3">
                <SearchInput value={search} onChange={setSearch} placeholder="Order, customer" />
                {[['', 'All'], ['CLOSED', 'Cutting closed'], ['RELEASED', 'Released'], ['OPEN', 'Cutting open']].map(([k, label]) => <button key={k} type="button" aria-pressed={gateIs === k} onClick={() => setGateIs(k)} className={`px-3 py-1 rounded-full text-sm font-semibold border ${gateIs === k ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-200 text-slate-600 hover:border-indigo-300'}`}>{label} <span className="tabular-nums">{k ? found.filter(o => stateOf(o) === k).length : found.length}</span></button>)}
            </div>
            <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
                <table className="w-full text-sm min-w-[860px]">
                    <thead className="bg-slate-50 text-left text-xs font-bold text-slate-500 uppercase tracking-wider"><tr><Th>Order</Th><Th>Customer</Th><Th>Ships</Th><Th right>Fabrics</Th><Th right>Rolls</Th><Th right>To send</Th><Th>Cutting</Th><Th right>Slips</Th><th /></tr></thead>
                    <tbody>
                        {shown.length === 0 && <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-400">No approved order here.</td></tr>}
                        {shown.map(o => {
                            const late = o.ship_date && o.ship_date < today;
                            return (
                                <tr key={o.id} className="border-t border-slate-100">
                                    <td className={`${TH} font-semibold`}>{o.order_no}{o.draft_no && <span className="block text-[11px] font-bold text-slate-500">draft {o.draft_no}</span>}{o.waiting > 0 && <span className="block text-[11px] font-bold text-amber-700">{o.waiting} waiting for cutting</span>}{o.report && <span className={`block text-[11px] font-bold ${o.report === 'SENT_BACK' ? 'text-rose-700' : 'text-slate-500'}`}>{REPORT[o.report]}</span>}</td>
                                    <td className={TH}>{o.customer_name}</td>
                                    <td className={`${TH} whitespace-nowrap ${late ? 'font-bold text-rose-700' : ''}`}>{late && <AlertTriangle size={13} className="inline mr-1" />}{fmtDate(o.ship_date)}</td>
                                    <td className={`${TH} text-right tabular-nums`}>{o.fabric_items || '—'}</td>
                                    <td className={`${TH} text-right tabular-nums`}>{o.rolls_held || '—'}</td>
                                    <td className={`${TH} text-right tabular-nums font-bold whitespace-nowrap`}>{unitsText(o.allocated)}</td>
                                    <td className={TH}>{!o.gate.allowed ? <><Flag tone="rose">Cutting closed</Flag><span className="block mt-0.5 text-[11px] text-slate-500">{[o.gate.fabric_short ? `${o.gate.fabric_short} fabric` : null, o.gate.trims_short ? `${o.gate.trims_short} trim` : null].filter(Boolean).join(' · ')} not allocated</span></> : o.gate.ready ? <span className="text-xs font-bold text-emerald-700">Cutting open</span> : <Flag>Released</Flag>}</td>
                                    <td className={`${TH} text-right tabular-nums`}>{o.slips}</td>
                                    <td className={`${TH} text-right`}><Link to={`/v3/material-issue/orders/${o.id}`} className="text-sm font-semibold text-indigo-700 hover:underline whitespace-nowrap">{o.fabric_items ? 'Issue →' : 'Open →'}</Link></td>
                                </tr>
                            );
                        })}
                    </tbody>
                    {shown.length > 0 && <tfoot className="bg-slate-50 border-t-2 border-slate-200 font-black"><tr><td className={TH} colSpan={3}>Total · {shown.length} order{shown.length === 1 ? '' : 's'}</td><td className={`${TH} text-right tabular-nums`}>{shown.reduce((a, o) => a + o.fabric_items, 0)}</td><td className={`${TH} text-right tabular-nums`}>{shown.reduce((a, o) => a + o.rolls_held, 0)}</td><td className={`${TH} text-right tabular-nums whitespace-nowrap`}>{unitsText(shown.flatMap(o => o.allocated))}</td><td className={TH} /><td className={`${TH} text-right tabular-nums`}>{shown.reduce((a, o) => a + o.slips, 0)}</td><td /></tr></tfoot>}
                </table>
            </div>
        </div>
    );
}

function ReceiveTab({ setError, canReceive }) {
    const navigate = useNavigate();
    const [rows, setRows] = useState(null);
    useEffect(() => { materialIssueApi.issues({ status: 'SUBMITTED' }).then(res => { setRows(res.data); setError(''); }).catch(err => setError(apiError(err, 'Failed to load the slips.'))); }, [setError]);
    if (!rows) return <Loading />;
    return (
        <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
            <table className="w-full text-sm min-w-[980px]">
                <SlipHead />
                <tbody>
                    {rows.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">No fabric is waiting for cutting.</td></tr>}
                    {[...rows].reverse().map(s => <SlipRow key={s.id} s={s} action={canReceive ? <button type="button" className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-bold whitespace-nowrap" onClick={() => navigate(`/v3/material-issue/issues/${s.id}`)}>Check and receive</button> : undefined} />)}
                </tbody>
                {rows.length > 0 && <tfoot className="bg-slate-50 border-t-2 border-slate-200 font-black"><tr><td className={TH} colSpan={3}>Total · {rows.length} slip{rows.length === 1 ? '' : 's'}</td><td className={`${TH} text-right tabular-nums`}>{rows.reduce((a, s) => a + s.rolls, 0)}</td><td className={`${TH} text-right tabular-nums whitespace-nowrap`}>{unitsText(rows.flatMap(s => s.totals))}</td><td className={TH} colSpan={2} /></tr></tfoot>}
            </table>
        </div>
    );
}

function ReportsTab({ setError }) {
    const [d, setD] = useState(null);
    useEffect(() => { materialIssueApi.report().then(res => { setD(res.data); setError(''); }).catch(err => setError(apiError(err, 'Failed to load the report.'))); }, [setError]);
    if (!d) return <Loading />;
    return (
        <div className="space-y-4">
            <div className="grid sm:grid-cols-3 gap-3">
                {[['Slips received, last 30 days', d.speed.slips], ['Average time to receive', d.speed.avg_hours == null ? '—' : `${d.speed.avg_hours} h`], ['Longest', d.speed.max_hours == null ? '—' : `${d.speed.max_hours} h`]].map(([k, v]) => <div key={k} className="bg-white border border-slate-200 rounded-xl px-4 py-3"><p className="text-xs font-bold text-slate-500">{k}</p><p className="text-xl font-black tabular-nums">{v}</p></div>)}
            </div>
            <section className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
                <p className="px-4 pt-3 font-black text-slate-800">Waiting for cutting to receive</p>
                <table className="w-full text-sm min-w-[560px] mt-2">
                    <thead className="bg-slate-50 text-left text-xs font-bold text-slate-500 uppercase tracking-wider"><tr><Th>Slip</Th><Th>Order</Th><Th>Sent by</Th><Th>Sent</Th><Th right>Waiting</Th></tr></thead>
                    <tbody>
                        {d.waiting.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400">Nothing waiting.</td></tr>}
                        {d.waiting.map(w => <tr key={w.id} className="border-t border-slate-100"><td className={TH}><Link to={`/v3/material-issue/issues/${w.id}`} className="font-semibold text-indigo-700 hover:underline">{w.issue_no}</Link></td><td className={TH}>{w.order_no}</td><td className={TH}>{w.submitted_by_name || '—'}</td><td className={TH}>{when(w.submitted_at)}</td><td className={`${TH} text-right tabular-nums font-bold`}>{w.hours} h</td></tr>)}
                    </tbody>
                    {d.waiting.length > 0 && <tfoot className="bg-slate-50 border-t-2 border-slate-200 font-black"><tr><td className={TH} colSpan={5}>Total · {d.waiting.length} slip{d.waiting.length === 1 ? '' : 's'}</td></tr></tfoot>}
                </table>
            </section>
            <section className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
                <p className="px-4 pt-3 font-black text-slate-800">Fabric at cutting, not on any batch</p>
                <p className="px-4 text-xs text-slate-500">Open orders, oldest first. Pocketing and lining aren't here: they're used in their own lays.</p>
                <table className="w-full text-sm min-w-[760px] mt-2">
                    <thead className="bg-slate-50 text-left text-xs font-bold text-slate-500 uppercase tracking-wider"><tr><Th>Order</Th><Th>Fabric</Th><Th>Roll</Th><Th>Lot</Th><Th>Slip</Th><Th right>Quantity</Th><Th right>Age</Th></tr></thead>
                    <tbody>
                        {d.at_cutting.length === 0 && <tr><td colSpan={7} className="px-4 py-6 text-center text-slate-400">Every roll at cutting is on a batch.</td></tr>}
                        {d.at_cutting.map(x => <tr key={`${x.issue_id}|${x.roll_id}`} className="border-t border-slate-100"><td className={`${TH} font-semibold`}>{x.order_no}</td><td className={TH}>{x.label}</td><td className={TH}>{x.roll_no}</td><td className={TH}>{x.dye_lot || '—'}</td><td className={TH}><Link to={`/v3/material-issue/issues/${x.issue_id}`} className="text-indigo-700 hover:underline">{x.issue_no}</Link></td><td className={`${TH} text-right tabular-nums`}>{fmtN(x.qty)} {x.uom}</td><td className={`${TH} text-right tabular-nums font-bold ${x.age_days > 7 ? 'text-rose-700' : ''}`}>{x.age_days} d</td></tr>)}
                    </tbody>
                    {d.at_cutting.length > 0 && <tfoot className="bg-slate-50 border-t-2 border-slate-200 font-black"><tr><td className={TH} colSpan={5}>Total · {d.at_cutting.length} roll{d.at_cutting.length === 1 ? '' : 's'}</td><td className={`${TH} text-right tabular-nums whitespace-nowrap`}>{unitsText(d.at_cutting)}</td><td className={TH} /></tr></tfoot>}
                </table>
            </section>
        </div>
    );
}

export default function MaterialIssueHomePage() {
    const [params, setParams] = useSearchParams();
    const [perm, setPerm] = useState(null);
    const [error, setError] = useState('');
    const stableSetError = useCallback((v) => setError(v), []);
    useEffect(() => { materialIssueApi.permissions().then(res => setPerm(res.data)).catch(() => setPerm({ issue: false, receive: false })); }, []);
    if (!perm) return <Loading />;
    const tabs = [...(perm.issue || !perm.receive ? [['orders', 'Orders to issue']] : []), ['receive', 'To receive'], ['slips', 'Fabric slips'], ['reports', 'Reports']];
    const asked = params.get('tab');
    const tab = tabs.some(([k]) => k === asked) ? asked : tabs[0][0];
    return (
        <div>
            <PageHeader title="Issue fabric" subtitle="Fabric goes to cutting against what is allocated to the order. The store submits a slip; the stock moves when the cutting manager receives it. Trims go out on Trim kits." />
            <div className="flex flex-wrap gap-1 mb-3 border-b border-slate-200">
                {tabs.map(([k, v]) => <button key={k} type="button" onClick={() => { setError(''); setParams({ tab: k }); }} className={`px-3 py-2 text-sm font-semibold border-b-2 -mb-px ${tab === k ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500'}`}>{v}</button>)}
            </div>
            <div className="mb-2"><ErrorBox text={error} /></div>
            {tab === 'orders' && <OrdersTab setError={stableSetError} />}
            {tab === 'receive' && <ReceiveTab setError={stableSetError} canReceive={perm.receive} />}
            {tab === 'slips' && <SlipsTab setError={stableSetError} />}
            {tab === 'reports' && <ReportsTab setError={stableSetError} />}
        </div>
    );
}

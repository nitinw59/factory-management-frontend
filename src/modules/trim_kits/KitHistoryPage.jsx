import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { trimKitsApi } from '../../api/trimKitsApi';
import Modal from '../../shared/Modal';
import { useAuth } from '../../context/AuthContext';
import ReportMissingModal from '../trim_loss/ReportMissingModal';
import { BatchTag, batchIdOf } from './BatchTag';
import { downloadHandover } from './handoverSlip';
import {
    Loader2, ArrowLeft, ArrowLeftRight, RefreshCw, AlertCircle, AlertTriangle, History, Package, Download, X, PackageX,
} from 'lucide-react';

const REPORTER_ROLES = ['line_loader', 'line_supervisor', 'line_manager', 'production_manager', 'factory_admin'];

const fmtDateTime = (d) => d ? new Date(d).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
const fmtMoney = (v) => `₹${parseFloat(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const variantText = (l) =>
    [`${l.color_number ? `${l.color_number} - ` : ''}${l.color_name || ''}`.trim(), l.variant_size].filter(Boolean).join(' / ');

// ── Detail modal — one handover (lines at cost + any loss cases raised on the slip) ──
export const HandoverDetailModal = ({ issueId, orderId, onClose }) => {
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);
    const [downloading, setDownloading] = useState(false);
    const [reportLine, setReportLine] = useState(null); // slip line being reported missing
    const navigate = useNavigate();
    const { user } = useAuth();
    const canReport = REPORTER_ROLES.includes(user?.role);
    const kitOrderId = orderId ?? data?.order_id ?? data?.trim_order_id;

    useEffect(() => {
        let alive = true;
        trimKitsApi.getKitHistoryDetail(issueId)
            .then(r => { console.log('[trimkits] getKitHistoryDetail raw:', r.data); console.log('[trimkits] getKitHistoryDetail raw JSON:\n' + JSON.stringify(r.data, null, 2)); if (alive) setData(r.data); })
            .catch(err => { if (alive) setError(err.response?.data?.error || 'Failed to load handover.'); });
        return () => { alive = false; };
    }, [issueId]);

    const download = async () => {
        if (!data) return;
        setDownloading(true);
        try {
            await downloadHandover(data);
        } finally {
            setDownloading(false);
        }
    };

    return (
      <>
        <Modal title={data ? `Handover ${data.issue_number}` : 'Handover'} onClose={onClose}>
            {error ? (
                <div className="p-4 bg-red-50 text-red-700 rounded-lg border border-red-200 text-sm font-medium">{error}</div>
            ) : !data ? (
                <div className="flex justify-center p-10"><Loader2 className="animate-spin h-7 w-7 text-indigo-600" /></div>
            ) : (
                <div className="space-y-4">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                        <div><p className="text-[10px] uppercase tracking-wider font-bold text-gray-400">Batch</p><p className="font-semibold text-gray-800"><BatchTag code={data.batch_code} id={batchIdOf(data)} /></p></div>
                        <div><p className="text-[10px] uppercase tracking-wider font-bold text-gray-400">Signed</p><p className="font-semibold text-gray-800">{fmtDateTime(data.created_at)}</p></div>
                        <div><p className="text-[10px] uppercase tracking-wider font-bold text-gray-400">Taken by</p><p className="font-semibold text-gray-800">{data.issued_to_name || '—'}</p></div>
                        <div><p className="text-[10px] uppercase tracking-wider font-bold text-gray-400">Prepared by</p><p className="font-semibold text-gray-800">{data.issued_by_name || '—'}</p></div>
                        {data.delivery_line_name && <div><p className="text-[10px] uppercase tracking-wider font-bold text-gray-400">Delivery line</p><p className="font-semibold text-gray-800">{data.delivery_line_name}</p></div>}
                        <div><p className="text-[10px] uppercase tracking-wider font-bold text-gray-400">Bill</p><p className="font-semibold text-gray-800">{data.bill_number || '—'}{data.bill_amount != null ? ` (${fmtMoney(data.bill_amount)})` : ''}</p></div>
                        <div><p className="text-[10px] uppercase tracking-wider font-bold text-gray-400">Total value</p><p className="font-semibold text-gray-800">{fmtMoney(data.total_value)}</p></div>
                    </div>

                    <div className="border border-gray-200 rounded-lg overflow-hidden">
                        <table className="w-full text-sm">
                            <thead className="bg-gray-50 text-[10px] uppercase text-gray-500 font-bold">
                                <tr>
                                    <th className="px-3 py-2 text-left">Item</th>
                                    <th className="px-3 py-2 text-right">Qty</th>
                                    <th className="px-3 py-2 text-right">Unit cost</th>
                                    <th className="px-3 py-2 text-right">Value</th>
                                    {canReport && <th className="px-3 py-2 text-right"></th>}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {(data.lines || []).map((l, i) => (
                                    <tr key={i}>
                                        <td className="px-3 py-2 text-gray-700"><span className="font-semibold">{l.item_name}</span>{variantText(l) ? ` — ${variantText(l)}` : ''}</td>
                                        <td className="px-3 py-2 text-right font-mono">{l.qty}</td>
                                        <td className="px-3 py-2 text-right font-mono">{Number(l.unit_cost) > 0 ? fmtMoney(l.unit_cost) : '—'}</td>
                                        <td className="px-3 py-2 text-right font-mono">{fmtMoney(l.line_value)}</td>
                                        {canReport && (
                                            <td className="px-3 py-2 text-right whitespace-nowrap">
                                                <button
                                                    onClick={() => setReportLine(l)}
                                                    className="inline-flex items-center gap-1 text-[11px] font-bold text-red-600 hover:text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1 hover:bg-red-100"
                                                    title="Report this trim as missing / lost"
                                                >
                                                    <PackageX className="w-3.5 h-3.5" /> Report missing
                                                </button>
                                            </td>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {(data.loss_cases || []).length > 0 && (
                        <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                            <div className="flex items-center gap-2 mb-2">
                                <PackageX className="w-4 h-4 text-red-600" />
                                <p className="text-xs font-bold uppercase tracking-wider text-red-700">Trim-loss cases on this slip</p>
                            </div>
                            <div className="space-y-1">
                                {data.loss_cases.map(lc => (
                                    <button
                                        key={lc.id}
                                        onClick={() => navigate(`/trim-loss/cases/${lc.id}`)}
                                        className="w-full flex items-center justify-between text-sm bg-white border border-red-100 rounded px-3 py-1.5 hover:border-red-300 text-left"
                                    >
                                        <span className="font-semibold text-gray-800">{lc.case_number}</span>
                                        <span className="text-xs text-gray-500">{lc.status}{lc.missing_qty != null ? ` · ${lc.missing_qty} missing` : ''}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="flex flex-col sm:flex-row gap-2">
                        {kitOrderId && (
                            <button
                                onClick={() => navigate(`/trim-kits/orders/${kitOrderId}`)}
                                className="flex-1 flex items-center justify-center px-5 py-3 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg font-bold hover:bg-indigo-100 transition-colors"
                                title="Open this kit to raise or sign an exchange (return/swap trims)"
                            >
                                <ArrowLeftRight className="w-4 h-4 mr-2" /> Open kit &amp; exchanges
                            </button>
                        )}
                        <button
                            onClick={download}
                            disabled={downloading}
                            className="flex-1 flex items-center justify-center px-5 py-3 bg-gray-900 text-white rounded-lg font-bold hover:bg-black transition-colors disabled:opacity-50"
                        >
                            {downloading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                            Download Slip PDF
                        </button>
                    </div>
                </div>
            )}
        </Modal>
        {reportLine && (
            <ReportMissingModal
                line={reportLine}
                header={data}
                onClose={() => setReportLine(null)}
            />
        )}
      </>
    );
};

// ── History register (optionally scoped to one batch/order via query params) ──
const KitHistoryPage = () => {
    const [params, setParams] = useSearchParams();
    const navigate = useNavigate();
    const [rows, setRows] = useState(null);
    const [error, setError] = useState(null);
    const [refreshing, setRefreshing] = useState(false);
    const [detail, setDetail] = useState(null); // { issueId, orderId }

    const production_batch_id = params.get('production_batch_id') || '';
    const batch_code = params.get('batch_code') || '';
    const order_id = params.get('order_id') || '';
    const order_ids_param = params.get('order_ids') || '';

    const [pending, setPending] = useState(null); // null=not computed; [] = none pending

    const fetchRows = useCallback(async () => {
        setRefreshing(true);
        setError(null);
        try {
            const q = {};
            if (production_batch_id) q.production_batch_id = production_batch_id;
            if (batch_code) q.batch_code = batch_code;
            if (order_id) q.order_id = order_id;
            const res = await trimKitsApi.getKitHistory(q);
            console.log('[trimkits] getKitHistory raw:', res.data);
            console.log('[trimkits] getKitHistory raw JSON:\n' + JSON.stringify(res.data, null, 2));
            setRows(res.data || []);
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to load pickup history.');
            setRows([]);
        } finally {
            setRefreshing(false);
        }
    }, [production_batch_id, batch_code, order_id]);

    useEffect(() => { fetchRows(); }, [fetchRows]);

    const scoped = production_batch_id || batch_code || order_id;

    // Which trim orders belong to this batch scope: ids passed on the URL (from the dashboard,
    // covers orders with zero pickups) unioned with any order that appears in the handover rows.
    const orderIds = useMemo(() => {
        const set = new Set();
        order_ids_param.split(',').map(s => s.trim()).filter(Boolean).forEach(id => set.add(id));
        if (order_id) set.add(order_id);
        (rows || []).forEach(r => { if (r.order_id != null) set.add(String(r.order_id)); });
        return [...set];
    }, [order_ids_param, order_id, rows]);

    // Pending = trims still owed to the batch that aren't in any picked-up (signed) kit:
    //  • not yet picked  (required − fulfilled)
    //  • awaiting handover (picked, not yet signed = unissued_qty)
    //  • unavailable (store-dismissed missing_items)
    const computePending = useCallback(async () => {
        if (!scoped || orderIds.length === 0) { setPending([]); return; }
        try {
            const orders = await Promise.all(
                orderIds.map(id => trimKitsApi.getKitOrder(id).then(r => r.data).catch(() => null))
            );
            console.log('[trimkits] pending source orders raw:', orders);
            console.log('[trimkits] pending source orders raw JSON:\n' + JSON.stringify(orders, null, 2));
            const out = [];
            orders.filter(Boolean).forEach(order => {
                (order.items || []).forEach(it => {
                    const req = Number(it.quantity_required) || 0;
                    const ful = Number(it.quantity_fulfilled) || 0;
                    const unissued = Number(it.unissued_qty) || 0;
                    const notPicked = Math.max(0, req - ful);
                    const pend = notPicked + Math.max(0, unissued);
                    if (pend > 0) out.push({
                        key: `pend-${order.id}-${it.id}`,
                        item_name: it.item_name, color_name: it.color_name, color_number: it.color_number, variant_size: it.variant_size,
                        qty: pend, notPicked, awaiting: Math.max(0, unissued),
                        kind: unissued > 0 && notPicked === 0 ? 'awaiting' : 'not_picked',
                    });
                });
                (order.missing_items || []).forEach((m, i) => out.push({
                    key: `miss-${order.id}-${m.id ?? i}`,
                    item_name: m.item_name, color_name: m.color_name, color_number: m.color_number, variant_size: m.variant_size,
                    qty: Number(m.quantity_required) || Number(m.missing_qty) || null,
                    kind: 'unavailable',
                }));
            });
            setPending(out);
        } catch {
            setPending([]);
        }
    }, [scoped, orderIds]);

    useEffect(() => { computePending(); }, [computePending]);

    return (
        <div className="max-w-4xl mx-auto">
            <div className="flex items-center justify-between mb-4">
                <button onClick={() => navigate(-1)} className="text-sm text-indigo-600 hover:underline flex items-center font-semibold">
                    <ArrowLeft className="w-4 h-4 mr-2" /> Back
                </button>
                <button onClick={fetchRows} disabled={refreshing} className="p-2 bg-white border border-gray-300 rounded-lg shadow-sm hover:bg-gray-50 text-gray-600 disabled:opacity-50" title="Refresh">
                    <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin text-indigo-600' : ''}`} />
                </button>
            </div>

            <div className="mb-5">
                <h1 className="text-2xl font-extrabold text-gray-900 flex items-center">
                    <History className="w-6 h-6 mr-3 text-indigo-600" /> Kit Pickup History
                </h1>
                {scoped ? (
                    <div className="flex items-center gap-2 mt-2">
                        <span className="inline-flex items-center gap-1.5 text-xs font-bold bg-indigo-100 text-indigo-800 border border-indigo-200 px-2.5 py-1 rounded-full">
                            <Package className="w-3.5 h-3.5" />
                            {order_id ? `Order #${order_id}` : <>Batch {batch_code && <span>{batch_code}</span>}{production_batch_id && <span className="font-mono font-black text-white bg-indigo-600 rounded px-1.5 py-0.5 text-[0.85em] leading-none">#{production_batch_id}</span>}</>}
                            <button onClick={() => setParams({})} className="ml-1 hover:text-indigo-600" aria-label="Clear filter"><X className="w-3.5 h-3.5" /></button>
                        </span>
                    </div>
                ) : (
                    <p className="text-sm text-gray-500 mt-1 font-medium">Every signed kit handover, newest first.</p>
                )}
            </div>

            {error && (
                <div className="p-4 mb-4 bg-red-50 text-red-700 rounded-xl border border-red-200 flex items-center text-sm font-medium">
                    <AlertCircle className="h-5 w-5 mr-3 shrink-0" /> {error}
                </div>
            )}

            {/* Pending trims — owed to the batch but not in any picked-up kit (batch scope only) */}
            {scoped && pending && pending.length > 0 && (
                <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                    <div className="flex items-center gap-2 mb-2">
                        <AlertTriangle className="w-4 h-4 text-amber-600" />
                        <p className="text-xs font-bold uppercase tracking-wider text-amber-700">Pending trims — not yet handed over for this batch</p>
                    </div>
                    <ul className="space-y-1">
                        {pending.map(m => {
                            const variant = [`${m.color_number ? `${m.color_number} - ` : ''}${m.color_name || ''}`.trim(), m.variant_size].filter(Boolean).join(' / ');
                            const tag = m.kind === 'unavailable' ? { label: 'unavailable', cls: 'bg-gray-100 text-gray-600' }
                                : m.kind === 'awaiting' ? { label: 'awaiting handover', cls: 'bg-indigo-100 text-indigo-700' }
                                : { label: 'not yet picked', cls: 'bg-amber-100 text-amber-700' };
                            return (
                                <li key={m.key} className="flex items-center justify-between text-sm bg-white border border-amber-100 rounded px-3 py-1.5">
                                    <span className="text-gray-700 truncate">
                                        {m.qty != null && <span className="font-mono font-bold text-amber-800 mr-1.5">{Number(m.qty).toLocaleString('en-IN')}×</span>}
                                        <span className="font-semibold">{m.item_name}</span>{variant ? ` — ${variant}` : ''}
                                    </span>
                                    <span className={`text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded shrink-0 ml-2 ${tag.cls}`}>{tag.label}</span>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            )}

            {rows === null ? (
                <div className="flex justify-center p-16"><Loader2 className="animate-spin h-10 w-10 text-indigo-600" /></div>
            ) : rows.length === 0 ? (
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-16 text-center">
                    <History className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-600 font-bold">No kit pickups {scoped ? 'for this batch yet' : 'recorded yet'}</p>
                    {scoped && pending && pending.length > 0 && (
                        <p className="text-sm text-amber-700 font-medium mt-2">All {pending.length} trim line{pending.length === 1 ? '' : 's'} for this batch are still pending (see above).</p>
                    )}
                </div>
            ) : (
                <div className="space-y-2">
                    {rows.map(r => (
                        <button
                            key={r.issue_id}
                            onClick={() => setDetail({ issueId: r.issue_id, orderId: r.order_id })}
                            className="w-full flex items-center justify-between gap-4 bg-white rounded-xl border border-gray-200 shadow-sm hover:border-indigo-300 transition-all px-4 py-3 text-left"
                        >
                            <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-mono font-bold text-gray-800">{r.issue_number}</span>
                                    <span className="text-xs font-semibold text-gray-500 inline-flex items-center gap-1">Batch <BatchTag code={r.batch_code} id={batchIdOf(r)} /></span>
                                    {r.delivery_line_name && <span className="text-[10px] uppercase tracking-wider font-bold bg-gray-100 text-gray-600 border border-gray-200 px-1.5 py-0.5 rounded">{r.delivery_line_name}</span>}
                                </div>
                                <p className="text-xs text-gray-500 mt-0.5">
                                    {fmtDateTime(r.created_at)}
                                    {r.issued_to_name && <> · taken by <span className="font-semibold text-gray-700">{r.issued_to_name}</span></>}
                                    {r.line_count != null && <> · {r.line_count} lines / {Number(r.total_qty ?? 0).toLocaleString('en-IN')} pcs</>}
                                </p>
                            </div>
                            <div className="text-right shrink-0">
                                <p className="font-mono font-bold text-gray-800">{fmtMoney(r.total_value)}</p>
                                {r.bill_number && <p className="text-[11px] text-gray-400">{r.bill_number}</p>}
                            </div>
                        </button>
                    ))}
                </div>
            )}

            {detail && <HandoverDetailModal issueId={detail.issueId} orderId={detail.orderId} onClose={() => setDetail(null)} />}
        </div>
    );
};

export default KitHistoryPage;

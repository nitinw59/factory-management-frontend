// ─── RELEASE RECOMMENDATIONS PAGE ───────────────────────────────────────────
// Surfaces sales orders that are SHIPPED, CANCELLED, or have every production
// batch dispatch-closed, but still hold live trim/fabric reservations —
// stock quietly tied up on orders that can no longer use it. Each order opens
// a verify-then-release screen (ReleaseVerifyModal); nothing here releases
// anything by itself.

import { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, PackageCheck, RotateCcw } from 'lucide-react';
import { planningApi } from '../../api/planningApi';
import { Spinner } from './merchandiserShared';
import ReleaseVerifyModal from './ReleaseVerifyModal';

const REASON_CFG = {
    SHIPPED:        { label: 'Shipped',                cls: 'bg-blue-50 text-blue-700 border-blue-200' },
    CANCELLED:      { label: 'Cancelled',               cls: 'bg-red-50 text-red-700 border-red-200' },
    ALL_DISPATCHED: { label: 'All Batches Dispatched',  cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
};

const Tile = ({ label, value, tone }) => (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">{label}</p>
        <p className={`text-2xl font-extrabold ${tone || 'text-slate-800'}`}>{value}</p>
    </div>
);

const ReleaseRecommendationsPage = () => {
    const [orders,     setOrders]     = useState(null);
    const [loading,    setLoading]    = useState(true);
    const [err,        setErr]        = useState(null);
    const [verifyOrder, setVerifyOrder] = useState(null);

    const load = useCallback(() => {
        setLoading(true);
        setErr(null);
        planningApi.getReleaseRecommendations()
            .then(res => setOrders((res.data?.data ?? res.data)?.orders ?? []))
            .catch(e => setErr(e?.response?.data?.error || e?.response?.data?.message || 'Failed to load release recommendations'))
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => { load(); }, [load]);

    const totalTrim   = (orders || []).reduce((s, o) => s + o.trim_reservations.length, 0);
    const totalFabric = (orders || []).reduce((s, o) => s + o.fabric_reservations.length, 0);
    const totalBlocked = (orders || []).reduce((s, o) => s + o.blocked_count, 0);

    return (
        <div className="p-6 space-y-5 max-w-5xl mx-auto">
            <div>
                <h1 className="font-extrabold text-slate-800 text-xl flex items-center gap-2">
                    <RotateCcw size={20} className="text-violet-500" /> Release Recommendations
                </h1>
                <p className="text-sm text-slate-500 mt-1">
                    Sales orders that are shipped, cancelled, or have every production batch dispatched — but still hold reserved trim or fabric stock. Review and release what's no longer needed.
                </p>
            </div>

            {loading && <Spinner />}
            {err && (
                <p className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                    <AlertTriangle size={15} className="shrink-0" /> {err}
                </p>
            )}

            {!loading && !err && orders && (
                <>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <Tile label="Candidate Orders" value={orders.length} />
                        <Tile label="Trim Reservations" value={totalTrim} tone="text-amber-600" />
                        <Tile label="Fabric Reservations" value={totalFabric} tone="text-indigo-600" />
                        <Tile label="Blocked (can't auto-release)" value={totalBlocked} tone="text-slate-400" />
                    </div>

                    {orders.length === 0 ? (
                        <div className="text-center py-16 border-2 border-dashed border-slate-200 rounded-xl bg-white">
                            <PackageCheck size={36} className="mx-auto text-emerald-300 mb-2" />
                            <p className="text-sm font-semibold text-slate-600">Nothing to release right now</p>
                            <p className="text-xs text-slate-400 mt-1">Every shipped/cancelled/fully-dispatched order has already had its reservations cleared.</p>
                        </div>
                    ) : (
                        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                            <table className="w-full text-left">
                                <thead className="bg-slate-50 text-slate-500 font-semibold text-[10px] uppercase tracking-wider border-b border-slate-200">
                                    <tr>
                                        <th className="px-5 py-3">Order</th>
                                        <th className="px-5 py-3">Reason</th>
                                        <th className="px-5 py-3 text-right">Trim</th>
                                        <th className="px-5 py-3 text-right">Fabric</th>
                                        <th className="px-5 py-3 text-right">Blocked</th>
                                        <th className="px-5 py-3 text-right">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {orders.map(o => {
                                        const reasonCfg = REASON_CFG[o.reason] || { label: o.reason, cls: 'bg-slate-100 text-slate-500 border-slate-200' };
                                        const hasReleasable = o.trim_reservations.length > 0 || o.fabric_reservations.length > 0;
                                        return (
                                            <tr key={o.sales_order_id} className="hover:bg-slate-50/60 transition-colors">
                                                <td className="px-5 py-3.5">
                                                    <p className="font-bold text-slate-800 text-sm">{o.order_number}</p>
                                                    <p className="text-xs text-slate-400">{o.customer_name}</p>
                                                </td>
                                                <td className="px-5 py-3.5">
                                                    <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${reasonCfg.cls}`}>
                                                        {reasonCfg.label}
                                                    </span>
                                                    {o.reason === 'ALL_DISPATCHED' && (
                                                        <p className="text-[10px] text-slate-400 mt-1">{o.dispatched_batch_count}/{o.batch_count} batches dispatched</p>
                                                    )}
                                                </td>
                                                <td className="px-5 py-3.5 text-right text-sm font-bold text-amber-600">{o.trim_reservations.length || '—'}</td>
                                                <td className="px-5 py-3.5 text-right text-sm font-bold text-indigo-600">{o.fabric_reservations.length || '—'}</td>
                                                <td className="px-5 py-3.5 text-right text-sm text-slate-400">{o.blocked_count || '—'}</td>
                                                <td className="px-5 py-3.5 text-right">
                                                    <button
                                                        onClick={() => setVerifyOrder(o)}
                                                        disabled={!hasReleasable}
                                                        className="text-xs font-bold text-white bg-violet-600 hover:bg-violet-700 disabled:opacity-30 disabled:cursor-not-allowed px-3 py-1.5 rounded-lg transition-colors"
                                                    >
                                                        Review & Release
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </>
            )}

            {verifyOrder && (
                <ReleaseVerifyModal
                    order={verifyOrder}
                    onClose={() => setVerifyOrder(null)}
                    onReleased={load}
                />
            )}
        </div>
    );
};

export default ReleaseRecommendationsPage;

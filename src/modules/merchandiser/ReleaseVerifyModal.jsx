// ─── RELEASE VERIFY MODAL ───────────────────────────────────────────────────
// Per-order "verify then release" screen for the Release Recommendations page.
// Lists every reservation the recommendation engine judged releasable (see
// getReleaseRecommendations — already pre-filtered to what the underlying
// delete endpoints would actually accept), pre-checked, and releases whichever
// stay checked one row at a time via the existing deleteFabricReservation /
// deleteTrimReservation endpoints — no new mutation endpoint, no blind bulk call.

import { useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, X } from 'lucide-react';
import { planningApi } from '../../api/planningApi';

const rowKey = (type, id) => `${type}:${id}`;

const ReleaseVerifyModal = ({ order, onClose, onReleased }) => {
    const allRows = [
        ...order.trim_reservations.map(r => ({ ...r, type: 'trim' })),
        ...order.fabric_reservations.map(r => ({ ...r, type: 'fabric' })),
    ];

    const [selected, setSelected] = useState(() => new Set(allRows.map(r => rowKey(r.type, r.reservation_id))));
    const [releasing, setReleasing] = useState(false);
    const [results, setResults] = useState({}); // { [rowKey]: 'ok' | error message }
    const [done, setDone] = useState(false);

    const toggle = (key) => setSelected(s => {
        const n = new Set(s);
        n.has(key) ? n.delete(key) : n.add(key);
        return n;
    });

    const toggleAll = () => setSelected(s =>
        s.size === allRows.length ? new Set() : new Set(allRows.map(r => rowKey(r.type, r.reservation_id)))
    );

    const handleRelease = async () => {
        setReleasing(true);
        setDone(false);
        const outcomes = {};
        for (const row of allRows) {
            const key = rowKey(row.type, row.reservation_id);
            if (!selected.has(key)) continue;
            try {
                if (row.type === 'trim') await planningApi.deleteTrimReservation(row.reservation_id);
                else                     await planningApi.deleteFabricReservation(row.reservation_id);
                outcomes[key] = 'ok';
            } catch (e) {
                outcomes[key] = e?.response?.data?.error || e?.response?.data?.message || 'Release failed';
            }
        }
        setResults(outcomes);
        setReleasing(false);
        setDone(true);
        onReleased();
    };

    const succeeded = Object.values(results).filter(v => v === 'ok').length;
    const failed    = Object.values(results).filter(v => v !== 'ok').length;
    const allSucceededAndNoneLeft = done && failed === 0;

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={!releasing ? onClose : undefined}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="flex items-start justify-between px-5 py-4 border-b border-slate-100 shrink-0">
                    <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Verify & Release</p>
                        <h2 className="font-extrabold text-slate-800 text-base">Order #{order.order_number}</h2>
                        <p className="text-xs text-slate-500 mt-0.5">
                            {order.customer_name}
                            {order.blocked_count > 0 && (
                                <span className="text-amber-600 font-semibold"> · {order.blocked_count} reservation{order.blocked_count !== 1 ? 's' : ''} not shown here (already consumed / roll in production — can't be auto-released)</span>
                            )}
                        </p>
                    </div>
                    {!releasing && <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1"><X size={18} /></button>}
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                    {allRows.length === 0 ? (
                        <p className="text-sm text-slate-400 italic text-center py-8">Nothing releasable on this order.</p>
                    ) : (
                        <>
                            <label className="flex items-center gap-2 text-xs font-bold text-slate-500 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={selected.size === allRows.length}
                                    onChange={toggleAll}
                                    className="accent-violet-600"
                                />
                                Select all ({allRows.length})
                            </label>

                            {order.trim_reservations.length > 0 && (
                                <div>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                                        Trim Reservations · {order.trim_reservations.length}
                                    </p>
                                    <div className="divide-y divide-slate-100 border border-slate-100 rounded-xl">
                                        {order.trim_reservations.map(r => {
                                            const key = rowKey('trim', r.reservation_id);
                                            const outcome = results[key];
                                            return (
                                                <label key={key} className="flex items-center gap-3 px-3 py-2.5 text-xs cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        checked={selected.has(key)}
                                                        onChange={() => toggle(key)}
                                                        disabled={releasing || outcome === 'ok'}
                                                        className="accent-violet-600 shrink-0"
                                                    />
                                                    <div className="flex-1 min-w-0">
                                                        <p className="font-bold text-slate-800 truncate">
                                                            {r.trim_item_name}
                                                            {r.color_name ? ` – ${r.color_name}` : ''}{r.color_number ? ` (${r.color_number})` : ''}
                                                        </p>
                                                        <p className="text-[10px] text-slate-400">{r.product_name}</p>
                                                    </div>
                                                    <span className="font-bold text-slate-700 tabular-nums shrink-0">
                                                        {r.quantity_reserved.toLocaleString()} {r.unit_of_measure}
                                                    </span>
                                                    {outcome === 'ok' && <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />}
                                                    {outcome && outcome !== 'ok' && <AlertCircle size={14} className="text-red-500 shrink-0" title={outcome} />}
                                                </label>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {order.fabric_reservations.length > 0 && (
                                <div>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                                        Fabric Reservations · {order.fabric_reservations.length}
                                    </p>
                                    <div className="divide-y divide-slate-100 border border-slate-100 rounded-xl">
                                        {order.fabric_reservations.map(r => {
                                            const key = rowKey('fabric', r.reservation_id);
                                            const outcome = results[key];
                                            return (
                                                <label key={key} className="flex items-center gap-3 px-3 py-2.5 text-xs cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        checked={selected.has(key)}
                                                        onChange={() => toggle(key)}
                                                        disabled={releasing || outcome === 'ok'}
                                                        className="accent-violet-600 shrink-0"
                                                    />
                                                    <div className="flex-1 min-w-0">
                                                        <p className="font-bold text-slate-800 truncate">
                                                            R-{r.fabric_roll_id} · {r.fabric_type_name}
                                                            {r.color_name ? ` – ${r.color_name}` : ''}{r.color_number ? ` (${r.color_number})` : ''}
                                                        </p>
                                                        <p className="text-[10px] text-slate-400">{r.product_name}</p>
                                                    </div>
                                                    <span className="font-bold text-slate-700 tabular-nums shrink-0">
                                                        {r.meters_reserved.toFixed(2)} m
                                                    </span>
                                                    {outcome === 'ok' && <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />}
                                                    {outcome && outcome !== 'ok' && <AlertCircle size={14} className="text-red-500 shrink-0" title={outcome} />}
                                                </label>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </>
                    )}

                    {done && (
                        <p className={`text-xs font-semibold px-3 py-2 rounded-lg ${failed > 0 ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}`}>
                            {succeeded} released{failed > 0 ? `, ${failed} failed — hover the red icon for the reason` : '.'}
                        </p>
                    )}
                </div>

                {/* Footer */}
                <div className="px-5 py-4 border-t border-slate-100 flex items-center justify-end gap-3 shrink-0">
                    <button onClick={onClose} disabled={releasing}
                        className="text-sm font-medium text-slate-500 hover:text-slate-700 px-4 py-2 rounded-lg hover:bg-slate-100 transition-colors disabled:opacity-40">
                        {allSucceededAndNoneLeft ? 'Close' : 'Cancel'}
                    </button>
                    {!allSucceededAndNoneLeft && (
                        <button
                            onClick={handleRelease}
                            disabled={releasing || selected.size === 0}
                            className="flex items-center gap-2 text-sm font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-40 px-5 py-2.5 rounded-xl transition-colors shadow-sm"
                        >
                            {releasing && <Loader2 size={14} className="animate-spin" />}
                            Release Selected ({selected.size})
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ReleaseVerifyModal;

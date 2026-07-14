import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { trimKitsApi } from '../../api/trimKitsApi';
import { kitBatchLabel } from './kitStatusConfig';
import { Loader2, RefreshCw, Package, ChevronRight, AlertCircle, Inbox } from 'lucide-react';

const fmtWhen = (d) => {
    if (!d) return '—';
    const then = new Date(d);
    const mins = Math.round((Date.now() - then.getTime()) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins} min ago`;
    if (mins < 24 * 60) return `${Math.floor(mins / 60)} h ago`;
    return then.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
};

const KitPickupQueuePage = () => {
    const [kits, setKits] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState(null);

    const fetchKits = useCallback(async (isRefresh = false) => {
        isRefresh ? setRefreshing(true) : setLoading(true);
        setError(null);
        try {
            const res = await trimKitsApi.getReadyKits();
            setKits(res.data || []);
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to load pickup queue.');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => { fetchKits(); }, [fetchKits]);

    // Kits get picked up by other loaders — refresh whenever the tab regains focus.
    useEffect(() => {
        const onFocus = () => fetchKits(true);
        window.addEventListener('focus', onFocus);
        return () => window.removeEventListener('focus', onFocus);
    }, [fetchKits]);

    return (
        <div className="max-w-4xl mx-auto">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-extrabold text-gray-900 flex items-center">
                        <Package className="w-7 h-7 mr-3 text-indigo-600" /> Kit Pickups
                    </h1>
                    <p className="text-sm text-gray-500 mt-1 font-medium">
                        Kits marked ready by the store. Count each item against the checklist, then sign to take custody.
                    </p>
                </div>
                <button
                    onClick={() => fetchKits(true)}
                    disabled={loading || refreshing}
                    className="p-2.5 bg-white border border-gray-300 rounded-lg shadow-sm hover:bg-gray-50 text-gray-700 transition-all disabled:opacity-50"
                    title="Refresh queue"
                >
                    <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin text-indigo-600' : ''}`} />
                </button>
            </div>

            {error && (
                <div className="p-4 mb-6 bg-red-50 text-red-700 rounded-xl border border-red-200 flex items-center text-sm font-medium">
                    <AlertCircle className="h-5 w-5 mr-3 shrink-0" /> {error}
                </div>
            )}

            {loading ? (
                <div className="flex justify-center p-16"><Loader2 className="animate-spin h-10 w-10 text-indigo-600" /></div>
            ) : kits.length === 0 ? (
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-16 text-center">
                    <Inbox className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-600 font-bold">No kits waiting for pickup</p>
                    <p className="text-sm text-gray-400 mt-1">You'll get a notification when the store marks a kit ready.</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {kits.map(kit => (
                        <Link
                            key={kit.id}
                            to={`/line-loader/trim-kits/orders/${kit.id}`}
                            className="block bg-white rounded-xl border border-gray-200 border-l-4 border-l-indigo-500 shadow-sm hover:shadow-md hover:border-indigo-300 transition-all p-5"
                        >
                            <div className="flex justify-between items-center gap-4">
                                <div className="min-w-0">
                                    <div className="flex items-center gap-3">
                                        <h3 className="font-bold text-lg text-gray-900 truncate">Batch {kitBatchLabel(kit)}</h3>
                                        <span className="text-[10px] uppercase tracking-wider font-bold bg-indigo-100 text-indigo-800 border border-indigo-200 px-2 py-0.5 rounded-full whitespace-nowrap">
                                            Ready for pickup
                                        </span>
                                    </div>
                                    <p className="text-sm text-gray-500 mt-1 font-medium">
                                        Marked ready {fmtWhen(kit.kit_ready_at)}
                                        {kit.kit_ready_by_name && <> by <span className="font-semibold text-gray-700">{kit.kit_ready_by_name}</span></>}
                                    </p>
                                </div>
                                <div className="flex items-center gap-6 shrink-0">
                                    <div className="text-center">
                                        <p className="text-xl font-black text-gray-800">{kit.item_count ?? '—'}</p>
                                        <p className="text-[10px] uppercase tracking-wider font-bold text-gray-400">Items</p>
                                    </div>
                                    <div className="text-center">
                                        <p className="text-xl font-black text-gray-800">{Number(kit.total_qty ?? 0).toLocaleString('en-IN')}</p>
                                        <p className="text-[10px] uppercase tracking-wider font-bold text-gray-400">Qty in this kit</p>
                                    </div>
                                    <ChevronRight className="w-5 h-5 text-gray-400" />
                                </div>
                            </div>
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
};

export default KitPickupQueuePage;

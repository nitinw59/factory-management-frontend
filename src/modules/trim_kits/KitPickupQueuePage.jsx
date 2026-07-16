import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { trimKitsApi } from '../../api/trimKitsApi';
import { BatchTag, batchIdOf } from './BatchTag';
import { getPickedKits, clearPickedKits } from './pickedKitsHistory';
import { resolveIssueId, downloadHandoverById } from './handoverSlip';
import { Loader2, RefreshCw, Package, ChevronRight, AlertCircle, Inbox, History, FileText, Download } from 'lucide-react';

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
    const [picked, setPicked] = useState(getPickedKits());
    const [slipBusy, setSlipBusy] = useState(null);   // key of the entry whose slip is downloading
    const [slipError, setSlipError] = useState(null);

    const fetchKits = useCallback(async (isRefresh = false) => {
        isRefresh ? setRefreshing(true) : setLoading(true);
        setError(null);
        try {
            const res = await trimKitsApi.getReadyKits();
            console.log('[trimkits] getReadyKits raw:', res.data);
            setKits(res.data || []);
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to load pickup queue.');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => { fetchKits(); }, [fetchKits]);

    // Kits get picked up by other loaders — refresh queue + local pickup history on focus.
    useEffect(() => {
        const onFocus = () => { fetchKits(true); setPicked(getPickedKits()); };
        window.addEventListener('focus', onFocus);
        return () => window.removeEventListener('focus', onFocus);
    }, [fetchKits]);

    const handleClearHistory = () => {
        if (!window.confirm('Clear your recently picked-up history on this device?')) return;
        clearPickedKits();
        setPicked([]);
    };

    // The on-device entry holds no lines — pull the signed slip back off the register and
    // render the same PDF the history page hands out.
    const downloadSlip = async (entry, key) => {
        setSlipBusy(key);
        setSlipError(null);
        try {
            const issueId = await resolveIssueId(entry);
            if (issueId == null) {
                setSlipError(`Couldn't find the slip for ${entry.issue_number || 'this pickup'} on the register.`);
                return;
            }
            await downloadHandoverById(issueId);
        } catch (err) {
            setSlipError(err.response?.data?.error || 'Failed to download the slip PDF.');
        } finally {
            setSlipBusy(null);
        }
    };

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
                <div className="flex items-center gap-2">
                    <Link
                        to="/line-loader/trim-kits/history"
                        className="flex items-center gap-1.5 px-3 py-2.5 bg-white border border-gray-300 rounded-lg shadow-sm hover:bg-gray-50 text-gray-700 text-sm font-bold transition-all"
                    >
                        <History className="h-4 w-4" /> History
                    </Link>
                    <button
                        onClick={() => fetchKits(true)}
                        disabled={loading || refreshing}
                        className="p-2.5 bg-white border border-gray-300 rounded-lg shadow-sm hover:bg-gray-50 text-gray-700 transition-all disabled:opacity-50"
                        title="Refresh queue"
                    >
                        <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin text-indigo-600' : ''}`} />
                    </button>
                </div>
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
                                        <h3 className="font-bold text-lg text-gray-900 truncate inline-flex items-center gap-1.5">Batch <BatchTag code={kit.batch_code} id={batchIdOf(kit)} /></h3>
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

            {/* Recently picked up — on-device history so a signed kit doesn't just vanish from the queue */}
            {picked.length > 0 && (
                <div className="mt-8">
                    <div className="flex items-center justify-between mb-3">
                        <h2 className="text-sm font-bold text-gray-600 uppercase tracking-wider flex items-center">
                            <History className="w-4 h-4 mr-2 text-gray-400" /> Recently picked up
                            <span className="ml-2 text-[10px] font-medium text-gray-400 normal-case tracking-normal">(on this device)</span>
                        </h2>
                        <button onClick={handleClearHistory} className="text-xs font-bold text-gray-400 hover:text-red-600">Clear</button>
                    </div>
                    {slipError && (
                        <div className="p-3 mb-2 bg-red-50 text-red-700 rounded-lg border border-red-200 flex items-center text-xs font-medium">
                            <AlertCircle className="h-4 w-4 mr-2 shrink-0" /> {slipError}
                        </div>
                    )}
                    <div className="space-y-2">
                        {picked.map((p, i) => {
                            const key = `${p.orderId}-${p.issue_number || i}`;
                            const canDownload = p.issue_id != null || !!p.issue_number;
                            return (
                                <div
                                    key={key}
                                    className="flex items-center bg-white rounded-xl border border-gray-200 shadow-sm hover:border-indigo-300 transition-all"
                                >
                                    <Link to={`/line-loader/trim-kits/orders/${p.orderId}`} className="flex-1 min-w-0 px-4 py-3">
                                        <div className="flex items-center gap-2">
                                            <FileText className="w-4 h-4 text-gray-400 shrink-0" />
                                            <span className="font-bold text-gray-800 truncate inline-flex items-center gap-1.5">
                                                Batch {p.batch_code || p.production_batch_id != null
                                                    ? <BatchTag code={p.batch_code} id={p.production_batch_id} />
                                                    : (p.batchLabel || `#${p.orderId}`)}
                                            </span>
                                            {p.order_status === 'PARTIALLY_ISSUED' && (
                                                <span className="text-[10px] uppercase tracking-wider font-bold bg-purple-100 text-purple-700 border border-purple-200 px-1.5 py-0.5 rounded whitespace-nowrap">partial</span>
                                            )}
                                        </div>
                                        <p className="text-xs text-gray-500 mt-0.5">
                                            {p.issue_number && <span className="font-mono">{p.issue_number}</span>}
                                            {p.signed_at && <> · signed {fmtWhen(p.signed_at)}</>}
                                        </p>
                                    </Link>
                                    {canDownload && (
                                        <button
                                            onClick={() => downloadSlip(p, key)}
                                            disabled={slipBusy === key}
                                            title="Download slip PDF"
                                            className="p-2 mr-1 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors disabled:opacity-50 shrink-0"
                                        >
                                            {slipBusy === key
                                                ? <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                                                : <Download className="w-4 h-4" />}
                                        </button>
                                    )}
                                    <ChevronRight className="w-5 h-5 text-gray-400 shrink-0 mr-3" />
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};

export default KitPickupQueuePage;

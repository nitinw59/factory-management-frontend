import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Loader2, PackageCheck, ChevronDown, ChevronUp,
    CheckCircle2, Clock, AlertTriangle, Package, Scissors, Tag, GitBranch, Plus,
} from 'lucide-react';
import { purchaseDeptApi } from '../../api/purchaseDeptApi';
import CreateFreshPoModal from './CreateFreshPoModal';

const STATUS_CFG = {
    PENDING:     { cls: 'bg-amber-100 text-amber-700 border-amber-200',   label: 'Pending'    },
    IN_PROGRESS: { cls: 'bg-blue-100 text-blue-700 border-blue-200',      label: 'In Progress' },
    COMPLETED:   { cls: 'bg-emerald-100 text-emerald-700 border-emerald-200', label: 'Received' },
    CANCELLED:   { cls: 'bg-slate-100 text-slate-500 border-slate-200',   label: 'Cancelled'  },
};

const TYPE_CFG = {
    fabric: { icon: Package,  label: 'Fabric' },
    trim:   { icon: Scissors, label: 'Trim'   },
    other:  { icon: Tag,      label: 'Other'  },
};

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en', { dateStyle: 'medium' }) : '—';
const fmt = (n, dec = 1) => Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: dec });

const OrdersPage = () => {
    const navigate = useNavigate();
    const [orders,        setOrders]        = useState([]);
    const [loading,       setLoading]       = useState(true);
    const [expandedId,    setExpandedId]    = useState(null);
    const [busy,          setBusy]          = useState(null);
    const [err,           setErr]           = useState(null);
    const [showFreshPo,   setShowFreshPo]   = useState(false);

    const fetchOrders = useCallback(async () => {
        setLoading(true);
        try {
            const res = await purchaseDeptApi.getOrders();
            setOrders(res.data?.data ?? res.data ?? []);
        } catch {
            setOrders([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchOrders(); }, [fetchOrders]);

    const handleMarkReceived = async (orderId) => {
        setBusy(orderId); setErr(null);
        try {
            await purchaseDeptApi.updateOrderStatus(orderId, 'COMPLETED');
            setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: 'COMPLETED' } : o));
        } catch (e) {
            setErr(e?.response?.data?.error || 'Failed to update status');
        } finally {
            setBusy(null);
        }
    };

    const pending   = orders.filter(o => o.status !== 'COMPLETED' && o.status !== 'CANCELLED');
    const completed = orders.filter(o => o.status === 'COMPLETED' || o.status === 'CANCELLED');

    const renderOrder = (order) => {
        const isExpanded = expandedId === order.id;
        const scfg       = STATUS_CFG[order.status] || STATUS_CFG.PENDING;
        const reqs       = order.requirements || [];
        const isOverdue  = order.expected_delivery_date && new Date(order.expected_delivery_date) < new Date() && order.status !== 'COMPLETED';

        return (
            <div
                key={order.id}
                className={`bg-white border rounded-2xl transition-all ${isOverdue ? 'border-red-300' : 'border-slate-200'}`}
            >
                <div
                    className="flex items-center gap-4 p-4 cursor-pointer select-none"
                    onClick={() => setExpandedId(isExpanded ? null : order.id)}
                >
                    <div className={`p-2 rounded-xl ${isOverdue ? 'bg-red-50' : 'bg-orange-50'}`}>
                        <PackageCheck size={18} className={isOverdue ? 'text-red-500' : 'text-orange-500'} />
                    </div>

                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-bold text-slate-800">PO #{order.id}</span>
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${scfg.cls}`}>
                                {scfg.label}
                            </span>
                            {isOverdue && (
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200">
                                    Overdue
                                </span>
                            )}
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                            {order.supplier_name || 'No supplier'} · {reqs.length} item{reqs.length !== 1 ? 's' : ''}
                            {order.expected_delivery_date ? ` · Due ${fmtDate(order.expected_delivery_date)}` : ''}
                        </p>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                        <button
                            onClick={e => { e.stopPropagation(); navigate(`/purchase-department/orders/${order.id}`); }}
                            className="flex items-center gap-1.5 text-xs font-bold text-orange-600 hover:text-white hover:bg-orange-600 border border-orange-200 hover:border-orange-600 px-3 py-1.5 rounded-lg transition-colors"
                            title="Open purchase flow"
                        >
                            <GitBranch size={12} />
                            View Flow
                        </button>
                        {order.status !== 'COMPLETED' && order.status !== 'CANCELLED' && (
                            <button
                                onClick={e => { e.stopPropagation(); handleMarkReceived(order.id); }}
                                disabled={busy === order.id}
                                className="flex items-center gap-1.5 text-xs font-bold text-white bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 px-3 py-1.5 rounded-lg transition-colors"
                            >
                                {busy === order.id
                                    ? <Loader2 size={12} className="animate-spin" />
                                    : <CheckCircle2 size={12} />
                                }
                                Mark Received
                            </button>
                        )}
                        {isExpanded ? <ChevronUp size={15} className="text-slate-400" /> : <ChevronDown size={15} className="text-slate-400" />}
                    </div>
                </div>

                {isExpanded && (
                    <div className="border-t border-slate-100 px-4 pb-4 pt-3">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4 text-xs">
                            <div>
                                <p className="text-[9px] font-bold text-slate-400 uppercase mb-0.5">Supplier</p>
                                <p className="font-medium text-slate-700">{order.supplier_name || '—'}</p>
                            </div>
                            <div>
                                <p className="text-[9px] font-bold text-slate-400 uppercase mb-0.5">Created</p>
                                <p className="font-medium text-slate-700">{fmtDate(order.created_at)}</p>
                            </div>
                            <div>
                                <p className="text-[9px] font-bold text-slate-400 uppercase mb-0.5">Expected Delivery</p>
                                <p className={`font-medium ${isOverdue ? 'text-red-600' : 'text-slate-700'}`}>
                                    {fmtDate(order.expected_delivery_date)}
                                </p>
                            </div>
                            <div>
                                <p className="text-[9px] font-bold text-slate-400 uppercase mb-0.5">Created by</p>
                                <p className="font-medium text-slate-700">{order.created_by_name || '—'}</p>
                            </div>
                        </div>

                        {reqs.length > 0 && (
                            <div>
                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-2">Requirements in this PO</p>
                                <div className="space-y-1.5">
                                    {reqs.map(req => {
                                        const typeCfg  = TYPE_CFG[req.type] || TYPE_CFG.other;
                                        const TypeIcon = typeCfg.icon;
                                        return (
                                            <div key={req.id} className="flex items-center gap-3 bg-slate-50 rounded-xl p-3">
                                                <TypeIcon size={13} className="text-slate-500 shrink-0" />
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-xs font-medium text-slate-800 truncate">
                                                        {req.description || `${typeCfg.label} requirement`}
                                                    </p>
                                                    <p className="text-[10px] text-slate-500">
                                                        {req.sales_order_product_name || '—'}
                                                    </p>
                                                </div>
                                                <div className="shrink-0 text-right">
                                                    <p className="text-xs font-bold text-slate-700">
                                                        {req.type === 'fabric'
                                                            ? `${fmt(req.meters_required)} m`
                                                            : `${fmt(req.quantity_required, 0)} ${req.unit_of_measure || 'pcs'}`}
                                                    </p>
                                                    {req.unit_price != null && (
                                                        <p className="text-[10px] text-slate-400">@ {Number(req.unit_price).toFixed(2)}</p>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-6">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <h1 className="text-xl font-bold text-slate-800">Purchase Orders</h1>
                    <p className="text-sm text-slate-500 mt-0.5">Track and manage all purchase orders created from requirements</p>
                </div>
                <button
                    onClick={() => setShowFreshPo(true)}
                    className="flex items-center gap-1.5 text-sm font-bold text-white bg-orange-500 hover:bg-orange-600 px-4 py-2 rounded-xl shadow-sm transition-colors shrink-0"
                >
                    <Plus size={14} /> Create PO
                </button>
            </div>

            {err && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-sm text-red-600">
                    <AlertTriangle size={15} /> {err}
                </div>
            )}

            {loading ? (
                <div className="flex justify-center items-center py-20">
                    <Loader2 className="animate-spin h-7 w-7 text-orange-400" />
                </div>
            ) : orders.length === 0 ? (
                <div className="text-center py-20 text-slate-400">
                    <PackageCheck size={40} className="mx-auto mb-3 opacity-30" />
                    <p className="font-medium">No purchase orders yet</p>
                    <p className="text-sm mt-1">Create purchase orders from the Requirements page</p>
                </div>
            ) : (
                <>
                    {pending.length > 0 && (
                        <div>
                            <div className="flex items-center gap-2 mb-3">
                                <Clock size={14} className="text-amber-500" />
                                <span className="text-sm font-bold text-slate-700">Open Orders · {pending.length}</span>
                            </div>
                            <div className="space-y-2">{pending.map(renderOrder)}</div>
                        </div>
                    )}

                    {completed.length > 0 && (
                        <div>
                            <div className="flex items-center gap-2 mb-3">
                                <CheckCircle2 size={14} className="text-emerald-500" />
                                <span className="text-sm font-bold text-slate-700">Completed · {completed.length}</span>
                            </div>
                            <div className="space-y-2 opacity-75">{completed.map(renderOrder)}</div>
                        </div>
                    )}
                </>
            )}

            {showFreshPo && (
                <CreateFreshPoModal
                    onClose={() => setShowFreshPo(false)}
                    onCreated={(data) => {
                        setShowFreshPo(false);
                        fetchOrders();
                        if (data?.id) navigate(`/purchase-department/orders/${data.id}`);
                    }}
                />
            )}
        </div>
    );
};

export default OrdersPage;

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Loader2, PackageCheck, ChevronDown, ChevronUp,
    CheckCircle2, Clock, AlertTriangle, GitBranch, Plus, Search, Inbox,
} from 'lucide-react';
import { purchaseDeptApi } from '../../api/purchaseDeptApi';
import CreateFreshPoModal from './CreateFreshPoModal';
import InwardCreateModal from './InwardCreateModal';
import InwardReviewModal from './InwardReviewModal';

const STATUS_CFG = {
    PENDING:     { cls: 'bg-amber-100 text-amber-700 border-amber-200',   label: 'Pending'    },
    IN_PROGRESS: { cls: 'bg-blue-100 text-blue-700 border-blue-200',      label: 'In Progress' },
    COMPLETED:   { cls: 'bg-emerald-100 text-emerald-700 border-emerald-200', label: 'Received' },
    CANCELLED:   { cls: 'bg-slate-100 text-slate-500 border-slate-200',   label: 'Cancelled'  },
};

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en', { dateStyle: 'medium' }) : '—';

const OrdersPage = () => {
    const navigate = useNavigate();
    const [orders,            setOrders]            = useState([]);
    const [loading,           setLoading]           = useState(true);
    const [expandedId,        setExpandedId]        = useState(null);
    const [busy,              setBusy]              = useState(null);
    const [err,               setErr]               = useState(null);
    const [showFreshPo,       setShowFreshPo]       = useState(false);
    const [completedExpanded, setCompletedExpanded] = useState(false);
    const [search,            setSearch]            = useState('');
    // Inward flow: 'create' shows InwardCreateModal, 'review' shows InwardReviewModal,
    // and inwardCtx carries everything both modals need + the form snapshot so we
    // can preserve state if the user clicks Back from review.
    const [inwardStep,        setInwardStep]        = useState(null);   // null | 'create' | 'review'
    const [inwardCtx,         setInwardCtx]         = useState(null);   // { po, items, inwards, snapshot?, payload?, lookups }
    const [openingInwardId,   setOpeningInwardId]   = useState(null);

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

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return orders;
        return orders.filter(o => [
            o.po_code, o.order_number, o.buyer_po_number,
            o.supplier_name, o.customer_name, o.created_by_name,
            String(o.id),
        ].some(v => (v || '').toString().toLowerCase().includes(q)));
    }, [orders, search]);

    const pending   = filtered.filter(o => o.status !== 'COMPLETED' && o.status !== 'CANCELLED');
    const completed = filtered.filter(o => o.status === 'COMPLETED' || o.status === 'CANCELLED');

    const canInward = (status) => status && status !== 'COMPLETED' && status !== 'CANCELLED' && status !== 'DRAFT';

    const openInward = async (order) => {
        if (!canInward(order.status)) return;
        setOpeningInwardId(order.id);
        setErr(null);
        try {
            const [poRes, iwRes] = await Promise.all([
                purchaseDeptApi.getOrderById(order.id),
                purchaseDeptApi.getInwards(order.id).catch(() => ({ data: [] })),
            ]);
            const po      = poRes.data?.data ?? poRes.data;
            const inwards = iwRes.data?.data ?? iwRes.data ?? [];
            if (!po) throw new Error('Could not load PO.');
            setInwardCtx({ po, items: po.items || [], inwards, snapshot: null, payload: null });
            setInwardStep('create');
        } catch (e) {
            setErr(e?.response?.data?.error || e.message || 'Failed to open inward form.');
        } finally {
            setOpeningInwardId(null);
        }
    };

    const closeInward = () => { setInwardStep(null); setInwardCtx(null); };

    const renderOrder = (order) => {
        const isExpanded = expandedId === order.id;
        const scfg       = STATUS_CFG[order.status] || STATUS_CFG.PENDING;
        const reqCount   = Number(order.requirement_count ?? 0);
        const fabCount   = Number(order.fabric_req_count ?? 0);
        const trimCount  = Number(order.trim_req_count ?? 0);
        const isCustom   = reqCount === 0 || order.order_number == null;
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
                            <span className="text-sm font-bold text-slate-800">{order.po_code || `PO #${order.id}`}</span>
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${scfg.cls}`}>
                                {scfg.label}
                            </span>
                            {isCustom && (
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                                    Custom PO
                                </span>
                            )}
                            {isOverdue && (
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200">
                                    Overdue
                                </span>
                            )}
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                            {order.supplier_name || 'No supplier'}
                            {reqCount > 0 && ` · ${reqCount} requirement${reqCount !== 1 ? 's' : ''}`}
                            {reqCount > 0 && (fabCount > 0 || trimCount > 0) && ` (${[fabCount && `${fabCount} fabric`, trimCount && `${trimCount} trim`].filter(Boolean).join(', ')})`}
                            {order.order_number ? ` · SO ${order.order_number}` : ''}
                            {order.customer_name ? ` · ${order.customer_name}` : ''}
                            {order.expected_delivery_date ? ` · Due ${fmtDate(order.expected_delivery_date)}` : ''}
                        </p>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                        {canInward(order.status) && (
                            <button
                                onClick={e => { e.stopPropagation(); openInward(order); }}
                                disabled={openingInwardId === order.id}
                                className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 hover:text-white hover:bg-emerald-600 border border-emerald-200 hover:border-emerald-600 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40"
                                title="Record an inward / GRN against this PO"
                            >
                                {openingInwardId === order.id
                                    ? <Loader2 size={12} className="animate-spin" />
                                    : <Inbox size={12} />}
                                Inward
                            </button>
                        )}
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

                        {reqCount > 0 && (
                            <div className="text-[11px] text-slate-500 italic">
                                {reqCount} requirement{reqCount !== 1 ? 's' : ''} linked. Open <span className="font-bold text-orange-600">View Flow</span> for the full item breakdown.
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

            {/* Search */}
            <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                    type="text"
                    placeholder="Search PO code, supplier, SO, customer…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="w-full text-sm border border-slate-200 rounded-xl pl-9 pr-3 py-2 focus:outline-none focus:border-orange-400"
                />
                {search && (
                    <button
                        onClick={() => setSearch('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400 hover:text-slate-600 uppercase tracking-wider"
                    >
                        Clear
                    </button>
                )}
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
                            <button
                                type="button"
                                onClick={() => setCompletedExpanded(v => !v)}
                                className="w-full flex items-center justify-between gap-2 mb-3 px-4 py-2.5 bg-white border border-slate-200 hover:border-emerald-300 rounded-xl transition-colors text-left"
                            >
                                <div className="flex items-center gap-2">
                                    <CheckCircle2 size={14} className="text-emerald-500" />
                                    <span className="text-sm font-bold text-slate-700">Completed</span>
                                    <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                                        {completed.length}
                                    </span>
                                </div>
                                <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                    {completedExpanded ? 'Hide' : 'Show'}
                                    {completedExpanded ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
                                </div>
                            </button>
                            {completedExpanded && (
                                <div className="space-y-2 opacity-75">{completed.map(renderOrder)}</div>
                            )}
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

            {inwardStep === 'create' && inwardCtx && (
                <InwardCreateModal
                    poId={inwardCtx.po.id}
                    poItems={inwardCtx.items}
                    allInwards={inwardCtx.inwards}
                    initialSnapshot={inwardCtx.snapshot}
                    onClose={closeInward}
                    onReview={({ payload, snapshot }) => {
                        setInwardCtx(prev => ({ ...prev, payload, snapshot }));
                        setInwardStep('review');
                    }}
                />
            )}

            {inwardStep === 'review' && inwardCtx?.payload && (
                <InwardReviewModal
                    poId={inwardCtx.po.id}
                    payload={inwardCtx.payload}
                    poItems={inwardCtx.items}
                    onClose={closeInward}
                    onBack={() => setInwardStep('create')}
                    onConfirmed={() => { closeInward(); fetchOrders(); }}
                />
            )}
        </div>
    );
};

export default OrdersPage;

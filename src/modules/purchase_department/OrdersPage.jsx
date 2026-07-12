import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Loader2, PackageCheck, ChevronDown, ChevronUp,
    CheckCircle2, Clock, AlertTriangle, GitBranch, Plus, Search, Inbox, StickyNote, XCircle,
} from 'lucide-react';
import { purchaseDeptApi } from '../../api/purchaseDeptApi';
import { useAuth } from '../../context/AuthContext';
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
    const { user } = useAuth();
    // Lifecycle actions (Mark Received / Cancel) are reserved for buyers and
    // admins. The store_manager has read access + can record inwards, but
    // can't change the PO's lifecycle.
    const canChangeLifecycle = user?.role === 'purchase_manager' || user?.role === 'factory_admin';
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
    const [checkingFulfilment, setCheckingFulfilment] = useState(false);
    const [fulfilledPoIds,     setFulfilledPoIds]     = useState(null); // null=not evaluated, []|[...]=result
    const [selectedForBulk,   setSelectedForBulk]    = useState(new Set());
    const [bulkBusy,          setBulkBusy]           = useState(false);

    // Cache of getOrderById detail per PO. Loaded eagerly for all orders on
    // the list so we can read items.length (for the inline-chip threshold)
    // and render the expanded body without a per-row click.
    const [detailsByPoId, setDetailsByPoId] = useState({});
    // Cache of inwards per PO. Loaded lazily when a row is expanded so we can
    // render a "received vs ordered" fulfilment summary without forcing the
    // user into the View Flow page.
    const [inwardsByPoId, setInwardsByPoId]   = useState({});
    const [invoicesByPoId, setInvoicesByPoId] = useState({});


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

    // Eager-fetch detail for every order on the list so we know items.length
    // (the gate for the inline-chip preview) and have the items ready for the
    // expanded body. Skips rows we've already cached; errors per row swallowed.
    useEffect(() => {
        if (!orders.length) return;
        const toFetch = orders.filter(o => !detailsByPoId[o.id]);
        if (toFetch.length === 0) return;
        let cancelled = false;
        Promise.all(toFetch.map(o =>
            purchaseDeptApi.getOrderById(o.id)
                .then(r => [o.id, r.data?.data ?? r.data ?? null])
                .catch(() => [o.id, null])
        )).then(pairs => {
            if (cancelled) return;
            setDetailsByPoId(prev => {
                const next = { ...prev };
                pairs.forEach(([id, detail]) => { if (detail) next[id] = detail; });
                return next;
            });
        });
        return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [orders]);

    // Lazy-fetch inwards + invoices when a row gets expanded. Caches per PO;
    // never re-fetches once we have data for a given PO.
    useEffect(() => {
        if (expandedId == null) return;
        let cancelled = false;

        if (inwardsByPoId[expandedId] === undefined) {
            purchaseDeptApi.getInwards(expandedId)
                .then(r => {
                    const data = r.data?.data ?? r.data ?? [];
                    console.log(`[PO ${expandedId}] inwards fetched:`, data);
                    if (!cancelled) setInwardsByPoId(prev => ({ ...prev, [expandedId]: data }));
                })
                .catch(() => { if (!cancelled) setInwardsByPoId(prev => ({ ...prev, [expandedId]: [] })); });
        }

        // Log PO detail items so we can inspect their fields (purchase_requirement_id etc.)
        const cachedDetail = detailsByPoId[expandedId];
        if (cachedDetail) {
            console.log(`[PO ${expandedId}] detail items:`, cachedDetail.items || []);
        }

        if (invoicesByPoId[expandedId] === undefined) {
            purchaseDeptApi.getInvoices(expandedId)
                .then(r => {
                    const data = r.data?.data ?? r.data ?? [];
                    console.log(`[PO ${expandedId}] invoices fetched:`, data);
                    if (!cancelled) setInvoicesByPoId(prev => ({ ...prev, [expandedId]: data }));
                })
                .catch(() => { if (!cancelled) setInvoicesByPoId(prev => ({ ...prev, [expandedId]: [] })); });
        }

        return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [expandedId]);


    const handleCancelOrder = async (order) => {
        const label = order.po_code || `PO #${order.id}`;
        if (!window.confirm(`Cancel ${label}?\n\nLinked requirements revert to PENDING and re-enter the queue.`)) return;
        setBusy(order.id); setErr(null);
        try {
            await purchaseDeptApi.updateOrderStatus(order.id, 'CANCELLED');
            setOrders(prev => prev.map(o => o.id === order.id ? { ...o, status: 'CANCELLED' } : o));
        } catch (e) {
            setErr(e?.response?.data?.error || 'Failed to cancel order');
        } finally {
            setBusy(null);
        }
    };

    // Build a compact label for a single PO line item chip.
    const itemChipLabel = (it) => {
        const qtyTxt = it.quantity != null
            ? ` · ${Number(it.quantity).toLocaleString()} ${it.uom || (it.item_type === 'fabric' ? 'm' : 'pcs')}`
            : '';
        if (it.item_type === 'fabric') {
            const type  = it.fabric_type_name || 'Fabric';
            const color = it.fabric_color_name ? ` · ${it.fabric_color_name}` : '';
            const num   = it.fabric_color_number ? ` (${it.fabric_color_number})` : '';
            return `${type}${color}${num}${qtyTxt}`;
        }
        if (it.item_type === 'spare') {
            return `${it.spare_part_name || 'Spare'}${it.spare_part_number ? ` (${it.spare_part_number})` : ''}${qtyTxt}`;
        }
        if (it.item_type === 'other') {
            return `${it.general_item_name || 'Other'}${it.general_item_code ? ` (${it.general_item_code})` : ''}${qtyTxt}`;
        }
        const name    = it.trim_item_name || 'Trim';
        const variant = it.variant_color_name ? ` · ${it.variant_color_name}` : '';
        const num     = it.variant_color_number ? ` (${it.variant_color_number})` : '';
        const sz      = it.variant_size ? ` · Sz ${it.variant_size}` : '';
        return `${name}${variant}${num}${sz}${qtyTxt}`;
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

    const calcFulfilmentPct = (items, inwards) => {
        const reqIdToItemId = {};
        items.forEach(it => (it.requirements || []).forEach(req => { reqIdToItemId[req.id] = it.id; }));
        const receivedById = {};
        (inwards || []).forEach(iw => {
            (iw.items || []).forEach(line => {
                const id = line.purchase_order_item_id ?? reqIdToItemId[line.purchase_requirement_id];
                if (id != null) receivedById[id] = (receivedById[id] || 0) + (Number(line.qty_received) || 0);
            });
        });
        let totalOrdered = 0, totalReceived = 0;
        items.forEach(it => {
            const ord = Number(it.quantity) || 0;
            totalOrdered  += ord;
            totalReceived += Math.min(receivedById[it.id] || 0, ord || (receivedById[it.id] || 0));
        });
        return totalOrdered > 0 ? Math.round((totalReceived / totalOrdered) * 100) : 0;
    };

    const checkFulfilment = async () => {
        setCheckingFulfilment(true);
        setErr(null);
        try {
            const allPending = orders.filter(o => o.status !== 'COMPLETED' && o.status !== 'CANCELLED');
            const toFetch = allPending.filter(o => inwardsByPoId[o.id] === undefined);
            const freshInwards = {};
            if (toFetch.length > 0) {
                const results = await Promise.all(toFetch.map(o =>
                    purchaseDeptApi.getInwards(o.id)
                        .then(r => [o.id, r.data?.data ?? r.data ?? []])
                        .catch(() => [o.id, []])
                ));
                results.forEach(([id, data]) => { freshInwards[id] = data; });
                setInwardsByPoId(prev => ({ ...prev, ...freshInwards }));
            }
            const allInwards = { ...inwardsByPoId, ...freshInwards };
            const fulfilled = allPending
                .filter(o => {
                    const detail = detailsByPoId[o.id];
                    if (!detail || !(detail.items || []).length) return false;
                    return calcFulfilmentPct(detail.items, allInwards[o.id] || []) >= 100;
                })
                .map(o => o.id);
            setFulfilledPoIds(fulfilled);
            setSelectedForBulk(new Set(fulfilled));
        } catch (e) {
            setErr(e?.response?.data?.error || 'Failed to evaluate fulfilment');
        } finally {
            setCheckingFulfilment(false);
        }
    };

    const markSelectedComplete = async () => {
        setBulkBusy(true);
        setErr(null);
        try {
            await Promise.all([...selectedForBulk].map(id =>
                purchaseDeptApi.updateOrderStatus(id, 'COMPLETED')
            ));
            setOrders(prev => prev.map(o => selectedForBulk.has(o.id) ? { ...o, status: 'COMPLETED' } : o));
            setFulfilledPoIds(null);
            setSelectedForBulk(new Set());
        } catch (e) {
            setErr(e?.response?.data?.error || 'Failed to mark orders as received');
        } finally {
            setBulkBusy(false);
        }
    };

    const renderOrder = (order) => {
        const isExpanded = expandedId === order.id;
        const scfg       = STATUS_CFG[order.status] || STATUS_CFG.PENDING;
        const reqCount   = Number(order.requirement_count ?? 0);
        const fabCount   = Number(order.fabric_req_count ?? 0);
        const trimCount  = Number(order.trim_req_count ?? 0);
        const spareCount = Number(order.spare_req_count ?? 0);
        const otherCount = Number(order.other_req_count ?? 0);
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
                            {order.notes && (
                                <span
                                    title={order.notes}
                                    className="text-amber-600 inline-flex items-center"
                                >
                                    <StickyNote size={12} />
                                </span>
                            )}
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                            {order.supplier_name || 'No supplier'}
                            {reqCount > 0 && ` · ${reqCount} requirement${reqCount !== 1 ? 's' : ''}`}
                            {reqCount > 0 && (fabCount > 0 || trimCount > 0 || spareCount > 0 || otherCount > 0) && ` (${[fabCount && `${fabCount} fabric`, trimCount && `${trimCount} trim`, spareCount && `${spareCount} spare`, otherCount && `${otherCount} other`].filter(Boolean).join(', ')})`}
                            {order.order_number ? ` · SO ${order.order_number}` : ''}
                            {order.customer_name ? ` · ${order.customer_name}` : ''}
                            {order.expected_delivery_date ? ` · Due ${fmtDate(order.expected_delivery_date)}` : ''}
                        </p>

                        {/* Inline item chips — only shown when the PO has 1-2 line items. */}
                        {(() => {
                            const detail = detailsByPoId[order.id];
                            const itemCount = detail ? (detail.items || []).length : null;
                            if (!detail || itemCount === 0 || itemCount >= 3) return null;
                            return (
                                <div className="flex flex-wrap gap-1 mt-1.5">
                                    {(detail.items || []).map((it, ix) => (
                                        <span
                                            key={it.id ?? ix}
                                            className={`text-[10px] font-medium px-1.5 py-0.5 rounded-md border ${
                                                it.item_type === 'fabric'
                                                    ? 'bg-violet-50 text-violet-700 border-violet-100'
                                                    : it.item_type === 'spare'
                                                        ? 'bg-blue-50 text-blue-700 border-blue-100'
                                                        : it.item_type === 'other'
                                                            ? 'bg-slate-50 text-slate-600 border-slate-200'
                                                            : 'bg-amber-50 text-amber-700 border-amber-100'
                                            }`}
                                            title={itemChipLabel(it)}
                                        >
                                            {itemChipLabel(it)}
                                        </span>
                                    ))}
                                </div>
                            );
                        })()}
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
                            onClick={e => { e.stopPropagation(); navigate(String(order.id)); }}
                            className="flex items-center gap-1.5 text-xs font-bold text-orange-600 hover:text-white hover:bg-orange-600 border border-orange-200 hover:border-orange-600 px-3 py-1.5 rounded-lg transition-colors"
                            title="Open purchase flow"
                        >
                            <GitBranch size={12} />
                            View Flow
                        </button>
                        {canChangeLifecycle && order.status !== 'COMPLETED' && order.status !== 'CANCELLED' && (
                            <button
                                onClick={e => { e.stopPropagation(); handleCancelOrder(order); }}
                                disabled={busy === order.id}
                                title="Cancel this PO — linked requirements revert to PENDING"
                                className="flex items-center gap-1.5 text-xs font-bold text-red-600 hover:text-white hover:bg-red-600 border border-red-200 hover:border-red-600 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40"
                            >
                                {busy === order.id
                                    ? <Loader2 size={12} className="animate-spin" />
                                    : <XCircle size={12} />
                                }
                                Cancel
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

                        {/* Items table + fulfilment summary */}
                        {(() => {
                            const detail = detailsByPoId[order.id];
                            const inwards = inwardsByPoId[order.id];
                            const invoices = invoicesByPoId[order.id] || [];
                            const inwardInvoiceMap = {};
                            invoices.forEach(inv => {
                                (inv.inwards || []).forEach(iw => { inwardInvoiceMap[iw.id] = inv; });
                            });
                            if (!detail) {
                                return (
                                    <p className="text-[11px] text-slate-400 italic flex items-center gap-1.5">
                                        <Loader2 size={11} className="animate-spin" /> Loading items…
                                    </p>
                                );
                            }
                            const items = detail.items || [];
                            if (items.length === 0) {
                                return <p className="text-[11px] text-slate-400 italic">No line items on this PO.</p>;
                            }
                            // Some inward lines are linked via purchase_requirement_id instead of
                            // purchase_order_item_id (when the PO item was created from a requirement).
                            // Build a fallback map so those lines still count toward the right PO item.
                            // Build requirement_id → po_item_id from the nested requirements array on each item.
                            const reqIdToItemId = {};
                            items.forEach(it => {
                                (it.requirements || []).forEach(req => { reqIdToItemId[req.id] = it.id; });
                            });
                            const receivedById = {};
                            (inwards || []).forEach(iw => {
                                (iw.items || []).forEach(line => {
                                    const id = line.purchase_order_item_id ?? reqIdToItemId[line.purchase_requirement_id];
                                    if (id == null) return;
                                    receivedById[id] = (receivedById[id] || 0) + (Number(line.qty_received) || 0);
                                });
                            });
                            let totalOrdered = 0;
                            let totalReceived = 0;
                            let fullyReceivedCount = 0;
                            items.forEach(it => {
                                const ord = Number(it.quantity) || 0;
                                const rec = receivedById[it.id] || 0;
                                totalOrdered  += ord;
                                totalReceived += Math.min(rec, ord || rec);
                                if (ord > 0 && rec >= ord) fullyReceivedCount += 1;
                            });
                            const pctTotal = totalOrdered > 0 ? Math.round((totalReceived / totalOrdered) * 100) : 0;

                            return (
                                <>
                                    <div className="overflow-hidden rounded-lg border border-slate-200">
                                        <table className="w-full text-[11px]">
                                            <thead className="bg-slate-50 text-slate-500 uppercase">
                                                <tr>
                                                    <th className="px-3 py-1.5 text-left font-bold">Item</th>
                                                    <th className="px-3 py-1.5 text-right font-bold w-24">Ordered</th>
                                                    <th className="px-3 py-1.5 text-right font-bold w-24">Received</th>
                                                    <th className="px-3 py-1.5 text-right font-bold w-24">Unit ₹</th>
                                                    <th className="px-3 py-1.5 text-right font-bold w-28">Line ₹</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {items.map(it => {
                                                    const ord = Number(it.quantity) || 0;
                                                    const rec = receivedById[it.id] || 0;
                                                    const full = ord > 0 && rec >= ord;
                                                    const partial = rec > 0 && !full;
                                                    const total = Number(it.total_price ?? (ord * (Number(it.unit_price) || 0)));
                                                    return (
                                                        <tr key={it.id} className="hover:bg-slate-50/60">
                                                            <td className="px-3 py-1.5 text-slate-700">{itemChipLabel(it)}</td>
                                                            <td className="px-3 py-1.5 text-right font-mono text-slate-700 tabular-nums">
                                                                {ord.toLocaleString()} {it.uom || (it.item_type === 'fabric' ? 'm' : 'pcs')}
                                                            </td>
                                                            <td className={`px-3 py-1.5 text-right font-mono tabular-nums ${full ? 'text-emerald-700 font-bold' : partial ? 'text-amber-700 font-bold' : 'text-slate-400'}`}>
                                                                {inwards == null ? '…' : rec.toLocaleString()}
                                                            </td>
                                                            <td className="px-3 py-1.5 text-right font-mono text-slate-600 tabular-nums">
                                                                {Number(it.unit_price ?? 0).toFixed(2)}
                                                            </td>
                                                            <td className="px-3 py-1.5 text-right font-mono font-bold text-slate-800 tabular-nums">
                                                                ₹{total.toFixed(2)}
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>

                                    {/* Fulfilment summary */}
                                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 px-1">
                                        <div className="flex items-center gap-2 text-[11px] text-slate-600">
                                            <CheckCircle2 size={13} className={pctTotal >= 100 ? 'text-emerald-600' : 'text-slate-400'} />
                                            <span className="font-bold">{fullyReceivedCount} / {items.length}</span>
                                            <span>line{items.length === 1 ? '' : 's'} fully received</span>
                                            <span className="text-slate-300">·</span>
                                            <span className={pctTotal >= 100 ? 'text-emerald-700 font-bold' : 'text-slate-700 font-bold'}>
                                                {pctTotal}%
                                            </span>
                                            <span>by qty</span>
                                            {inwards != null && (
                                                <>
                                                    <span className="text-slate-300">·</span>
                                                    <span>{inwards.length} inward{inwards.length === 1 ? '' : 's'} logged</span>
                                                </>
                                            )}
                                        </div>
                                        <button
                                            onClick={() => navigate(String(order.id))}
                                            className="text-[11px] font-bold text-orange-600 hover:text-orange-800 transition-colors"
                                        >
                                            Open View Flow →
                                        </button>
                                    </div>

                                    {/* GRN · Invoice Status nodes */}
                                    {inwards && inwards.length > 0 && (
                                        <div className="mt-4">
                                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                                                GRN · Invoice Status
                                            </p>
                                            <div className="space-y-2">
                                                {inwards.map(iw => {
                                                    const invoice = inwardInvoiceMap[iw.id];
                                                    const pmtCls = {
                                                        PAID:           'text-emerald-700',
                                                        PARTIALLY_PAID: 'text-blue-600',
                                                        UNPAID:         'text-amber-600',
                                                        OVERDUE:        'text-red-600',
                                                    }[invoice?.payment_status] ?? 'text-slate-500';
                                                    return (
                                                        <div key={iw.id} className="flex items-stretch gap-2">
                                                            <div className="flex-1 border border-slate-200 rounded-xl bg-slate-50 px-3 py-2 text-[11px]">
                                                                <p className="font-bold text-slate-700">{iw.grn_number || `GRN #${iw.id}`}</p>
                                                                <p className="text-slate-400">{fmtDate(iw.received_date)}</p>
                                                            </div>
                                                            <div className="flex items-center text-slate-300 text-sm px-1">→</div>
                                                            {invoice ? (
                                                                <div className="flex-1 border border-emerald-300 rounded-xl bg-emerald-50 px-3 py-2 text-[11px]">
                                                                    <p className="font-bold text-emerald-800">{invoice.invoice_number}</p>
                                                                    <p className={`font-medium ${pmtCls}`}>
                                                                        ₹{Number(invoice.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                                                        {' · '}{invoice.payment_status?.replace(/_/g, ' ')}
                                                                    </p>
                                                                </div>
                                                            ) : (
                                                                <div className="flex-1 border border-red-300 rounded-xl bg-red-50 px-3 py-2 text-[11px]">
                                                                    <p className="font-bold text-red-600">No Invoice</p>
                                                                    <p className="text-red-400 text-[10px]">Invoice not yet created</p>
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}
                                </>
                            );
                        })()}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="p-4 sm:p-6 space-y-6">
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
                                {canChangeLifecycle && (
                                    <button
                                        onClick={checkFulfilment}
                                        disabled={checkingFulfilment}
                                        className="ml-auto flex items-center gap-1.5 text-xs font-bold text-emerald-700 hover:text-white hover:bg-emerald-600 border border-emerald-200 hover:border-emerald-600 px-3 py-1 rounded-lg transition-colors disabled:opacity-40"
                                    >
                                        {checkingFulfilment
                                            ? <Loader2 size={12} className="animate-spin" />
                                            : <CheckCircle2 size={12} />}
                                        {checkingFulfilment ? 'Checking…' : 'Check Fulfilment'}
                                    </button>
                                )}
                            </div>

                            {fulfilledPoIds !== null && (
                                <div className="mb-3 border border-emerald-200 rounded-xl bg-emerald-50 p-4">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-sm font-bold text-emerald-800">
                                            {fulfilledPoIds.length === 0
                                                ? 'No open POs are fully fulfilled yet'
                                                : `${fulfilledPoIds.length} PO${fulfilledPoIds.length === 1 ? '' : 's'} fully fulfilled`}
                                        </span>
                                        <button
                                            onClick={() => { setFulfilledPoIds(null); setSelectedForBulk(new Set()); }}
                                            className="text-[10px] font-bold text-emerald-600 hover:text-emerald-800 uppercase tracking-wider"
                                        >
                                            Dismiss
                                        </button>
                                    </div>
                                    {fulfilledPoIds.length > 0 && (
                                        <>
                                            <div className="space-y-1.5 mb-3">
                                                {fulfilledPoIds.map(id => {
                                                    const o = orders.find(p => p.id === id);
                                                    if (!o) return null;
                                                    return (
                                                        <label key={id} className="flex items-center gap-2.5 cursor-pointer">
                                                            <input
                                                                type="checkbox"
                                                                checked={selectedForBulk.has(id)}
                                                                onChange={e => setSelectedForBulk(prev => {
                                                                    const next = new Set(prev);
                                                                    e.target.checked ? next.add(id) : next.delete(id);
                                                                    return next;
                                                                })}
                                                                className="accent-emerald-600"
                                                            />
                                                            <span className="text-xs font-bold text-slate-700">{o.po_code || `PO #${o.id}`}</span>
                                                            <span className="text-xs text-slate-500">{o.supplier_name || '—'}</span>
                                                        </label>
                                                    );
                                                })}
                                            </div>
                                            <button
                                                onClick={markSelectedComplete}
                                                disabled={bulkBusy || selectedForBulk.size === 0}
                                                className="flex items-center gap-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 px-4 py-1.5 rounded-lg transition-colors"
                                            >
                                                {bulkBusy
                                                    ? <Loader2 size={12} className="animate-spin" />
                                                    : <CheckCircle2 size={12} />}
                                                Mark {selectedForBulk.size} as Received
                                            </button>
                                        </>
                                    )}
                                </div>
                            )}

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
                        if (data?.id) navigate(String(data.id));
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

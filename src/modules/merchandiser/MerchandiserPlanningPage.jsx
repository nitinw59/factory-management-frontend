// src/modules/merchandiser/MerchandiserPlanningPage.jsx
//
// Route entry point (kept at this path/export name — see App.js's 3 routes).
// Owns the order sidebar and order-detail fetching; the right panel switches
// between the SOP list (SopListPanel) and, once a product line is opened, its
// full-page requirements workspace (MerchandiserSopWorkspace) — replacing the
// old "click a SopCard → open ProductionTrackingModal" pattern.

import { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ShoppingBag } from 'lucide-react';
import { planningApi } from '../../api/planningApi';
import { Spinner } from './merchandiserShared';
import BomPreviewModal from './BomPreviewModal';
import SopListPanel from './SopListPanel';
import MerchandiserSopWorkspace from './MerchandiserSopWorkspace';

// ─── ORDER STATUS CONFIG ────────────────────────────────────────────────────

// Matches the backend's sales_order_status enum exactly: DRAFT, CONFIRMED,
// IN_PRODUCTION, SHIPPED, CANCELLED (this used to key on COMPLETED, a value
// the enum has never had — so a SHIPPED order's badge always fell through to
// the OrderCard's gray default regardless of its real status).
const ORDER_STATUS_CFG = {
    DRAFT:          { cls: 'bg-slate-100 text-slate-500'   },
    CONFIRMED:      { cls: 'bg-blue-100 text-blue-700'     },
    IN_PRODUCTION:  { cls: 'bg-violet-100 text-violet-700' },
    SHIPPED:        { cls: 'bg-emerald-100 text-emerald-700'},
    CANCELLED:      { cls: 'bg-red-100 text-red-500'       },
};

// ─── ORDER CARD (left sidebar) ─────────────────────────────────────────────

const OrderCard = ({ order, isSelected, onClick }) => {
    const { cls } = ORDER_STATUS_CFG[order.status] || { cls: 'bg-gray-100 text-gray-500' };
    const linked    = order.linked_bom_count ?? 0;
    const total     = order.product_count    ?? 0;
    const allLinked = linked === total && total > 0;
    const customerName = order.customer_name || order.buyer_name || '—';
    const productNames = order.product_names     || [];
    const fabricTypes  = order.fabric_type_names || [];

    return (
        <button
            onClick={onClick}
            className={`w-full text-left px-4 py-3 border-b border-slate-100 transition-colors hover:bg-slate-50
                ${isSelected ? 'bg-violet-50 border-l-[3px] border-l-violet-500' : 'border-l-[3px] border-l-transparent'}`}
        >
            <div className="flex items-center justify-between mb-1">
                <span className="font-bold text-slate-800 text-sm truncate">
                    {order.order_number}
                    {order.buyer_po_number && (
                        <span className="font-normal text-slate-400 ml-1 text-[10px]">· PO {order.buyer_po_number}</span>
                    )}
                </span>
                <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase shrink-0 ml-1 ${cls}`}>
                    {order.status}
                </span>
            </div>
            <p className="text-[11px] text-slate-500 mb-1 truncate">{customerName}</p>
            {productNames.length > 0 && (
                <p className="text-[10px] text-slate-400 mb-1.5 truncate">
                    <span className="text-slate-500 font-medium">{productNames[0]}</span>
                    {productNames.length > 1 && ` +${productNames.length - 1} more`}
                    {fabricTypes.length > 0 && ` · ${fabricTypes.join(', ')}`}
                </p>
            )}
            <div className="flex items-center justify-between">
                <span className={`text-[10px] font-bold ${allLinked ? 'text-emerald-600' : 'text-amber-600'}`}>
                    {linked}/{total} BOMs linked
                </span>
                {order.delivery_date && (
                    <span className="text-[10px] text-slate-400">
                        {new Date(order.delivery_date).toLocaleDateString()}
                    </span>
                )}
            </div>
        </button>
    );
};

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────

const ProductionPlanningPage = () => {
    const [formData,        setFormData]        = useState(null);
    const [loadingForm,     setLoadingForm]     = useState(true);
    const [formErr,         setFormErr]         = useState(null);

    const [selectedOrderId, setSelectedOrderId] = useState(null);
    const [orderDetail,     setOrderDetail]     = useState(null);
    const [loadingOrder,    setLoadingOrder]    = useState(false);

    const [linking,           setLinking]           = useState({});
    const [searchQ,           setSearchQ]           = useState('');
    const [filterStatus,      setFilterStatus]      = useState('ALL');
    const [needsBomOnly,      setNeedsBomOnly]      = useState(false);
    const [previewBomId,      setPreviewBomId]      = useState(null);
    const [sidebarOpen,       setSidebarOpen]       = useState(true);
    // For the Secondary Fabric picker in LinkAndAllocateModal — only needed when a BOM has
    // a generic SECONDARY fabric line, but cheap enough to load once up front.
    const [fabricTypes,       setFabricTypes]       = useState([]);
    // Which SOP's full-page requirements workspace is open, if any. null = show the list.
    const [openWorkspaceSopId, setOpenWorkspaceSopId] = useState(null);

    // Load sales orders + approved BOMs on mount
    useEffect(() => {
        planningApi.getFormData()
            .then(res => setFormData(res.data?.data ?? res.data))
            .catch(e  => setFormErr(e?.response?.data?.error || e?.response?.data?.message || 'Failed to load planning data'))
            .finally(() => setLoadingForm(false));
        planningApi.getFabricTypes()
            .then(res => setFabricTypes(res.data?.data ?? res.data ?? []))
            .catch(e  => console.error('Failed to load fabric types', e));
    }, []);

    const refreshOrder = useCallback(async (orderId) => {
        const [detailRes, fdRes] = await Promise.all([
            planningApi.getOrderDetail(orderId),
            planningApi.getFormData(),
        ]);
        setOrderDetail(detailRes.data?.data ?? detailRes.data);
        setFormData(fdRes.data?.data ?? fdRes.data);
    }, []);

    const selectOrder = useCallback((orderId) => {
        if (orderId === selectedOrderId) return;
        setSelectedOrderId(orderId);
        setOrderDetail(null);
        setOpenWorkspaceSopId(null);
        setLoadingOrder(true);
        planningApi.getOrderDetail(orderId)
            .then(res => setOrderDetail(res.data?.data ?? res.data))
            .catch(e  => console.error('Order detail fetch failed', e))
            .finally(() => setLoadingOrder(false));
    }, [selectedOrderId]);

    const handleLink = useCallback(async (sopId, bomId, secondaryFabricTypeId = null) => {
        setLinking(l => ({ ...l, [sopId]: true }));
        try {
            const res = await planningApi.linkBom(sopId, {
                bom_id: bomId,
                secondary_fabric_type_id: secondaryFabricTypeId,
            });
            await refreshOrder(selectedOrderId);
            return res?.data;
        } catch (e) {
            console.error('Link BOM failed', e);
            throw e;
        } finally {
            setLinking(l => ({ ...l, [sopId]: false }));
        }
    }, [selectedOrderId, refreshOrder]);

    const handleUnlink = useCallback(async (sopId) => {
        setLinking(l => ({ ...l, [sopId]: true }));
        try {
            await planningApi.unlinkBom(sopId);
            await refreshOrder(selectedOrderId);
        } catch (e) {
            console.error('Unlink BOM failed', e);
        } finally {
            setLinking(l => ({ ...l, [sopId]: false }));
        }
    }, [selectedOrderId, refreshOrder]);

    // Generic "please re-sync this order" signal — used after a readiness
    // toggle, a BOM link, or any mutation inside the SOP workspace (reserve,
    // release, recalculate, raise PR) that might have changed bom_id or
    // production_readiness.
    const handleSopChanged = useCallback(() => {
        if (selectedOrderId) refreshOrder(selectedOrderId);
    }, [selectedOrderId, refreshOrder]);

    const orders         = formData?.sales_orders    || [];
    const bomsByProduct  = formData?.boms_by_product || {};
    const sops           = orderDetail?.products     || [];
    const unlinkedCount  = sops.filter(s => !s.bom_linked && !s.bom_id).length;
    const workspaceSop   = openWorkspaceSopId ? sops.find(s => s.id === openWorkspaceSopId) : null;

    const filteredOrders = orders.filter(o => {
        const matchesSearch =
            !searchQ ||
            o.order_number?.toLowerCase().includes(searchQ.toLowerCase()) ||
            (o.customer_name || o.buyer_name || '').toLowerCase().includes(searchQ.toLowerCase());
        const matchesStatus = filterStatus === 'ALL' || o.status === filterStatus;
        const matchesNeedsBom = !needsBomOnly || (o.product_count > 0 && (o.linked_bom_count || 0) < o.product_count);
        return matchesSearch && matchesStatus && matchesNeedsBom;
    });

    return (
        <>
        <div className="flex h-full bg-slate-50 overflow-hidden">

            {/* ── LEFT: Order sidebar (collapsible) ── */}
            <div className={`${sidebarOpen ? 'w-72 min-w-[18rem]' : 'w-14'} bg-white border-r border-slate-200 flex flex-col overflow-hidden transition-all duration-200 shrink-0`}>
                {sidebarOpen ? (
                    <>
                        <div className="px-4 py-4 border-b border-slate-100 shrink-0">
                            <div className="flex items-center justify-between mb-3">
                                <h2 className="font-extrabold text-slate-800 text-sm">Sales Orders</h2>
                                <button
                                    onClick={() => setSidebarOpen(false)}
                                    className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 p-1 rounded-lg transition-colors"
                                    title="Collapse sidebar"
                                >
                                    <ChevronLeft size={15} />
                                </button>
                            </div>
                            <input
                                type="search"
                                placeholder="Search order or buyer…"
                                value={searchQ}
                                onChange={e => setSearchQ(e.target.value)}
                                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-violet-400"
                            />
                            <div className="flex flex-wrap items-center gap-1 mt-2.5">
                                {['ALL', 'DRAFT', 'CONFIRMED', 'IN_PRODUCTION', 'SHIPPED', 'CANCELLED'].map(s => (
                                    <button
                                        key={s}
                                        onClick={() => setFilterStatus(s)}
                                        className={`px-2 py-1 rounded-md text-[10px] font-bold transition-colors ${
                                            filterStatus === s ? 'bg-violet-600 text-white shadow-sm' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                                        }`}
                                    >
                                        {s === 'ALL' ? 'All' : s.replace(/_/g, ' ')}
                                    </button>
                                ))}
                                <button
                                    onClick={() => setNeedsBomOnly(v => !v)}
                                    title="Only orders with at least one product line missing a BOM link"
                                    className={`px-2 py-1 rounded-md text-[10px] font-bold transition-colors ml-auto ${
                                        needsBomOnly ? 'bg-amber-500 text-white shadow-sm' : 'bg-amber-50 text-amber-600 hover:bg-amber-100'
                                    }`}
                                >
                                    Needs BOM
                                </button>
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto">
                            {loadingForm && <Spinner h={32} />}
                            {formErr && <p className="text-xs text-red-500 px-4 py-3">{formErr}</p>}
                            {!loadingForm && filteredOrders.length === 0 && (
                                <p className="text-xs text-slate-400 text-center py-10">No orders found</p>
                            )}
                            {filteredOrders.map(order => (
                                <OrderCard
                                    key={order.id}
                                    order={order}
                                    isSelected={selectedOrderId === order.id}
                                    onClick={() => selectOrder(order.id)}
                                />
                            ))}
                        </div>
                    </>
                ) : (
                    /* ── Collapsed rail ── */
                    <div className="flex flex-col items-center pt-3 pb-4 gap-3 overflow-y-auto">
                        {/* Donut: BOM-linking completion — click to expand */}
                        <button
                            onClick={() => setSidebarOpen(true)}
                            title={`${sops.length - unlinkedCount}/${sops.length} BOMs linked — click to expand`}
                            className="shrink-0 hover:opacity-80 transition-opacity"
                        >
                            {(() => {
                                const r  = 14;
                                const circ = 2 * Math.PI * r;
                                const frac = sops.length > 0 ? (sops.length - unlinkedCount) / sops.length : 0;
                                const color = frac === 1 ? '#10b981' : frac > 0 ? '#a78bfa' : '#cbd5e1';
                                return (
                                    <svg width="40" height="40" viewBox="0 0 40 40">
                                        <circle cx="20" cy="20" r={r} fill="none" stroke="#e2e8f0" strokeWidth="4" />
                                        <circle cx="20" cy="20" r={r} fill="none" stroke={color} strokeWidth="4"
                                            strokeDasharray={circ}
                                            strokeDashoffset={circ * (1 - frac)}
                                            strokeLinecap="round"
                                            transform="rotate(-90 20 20)"
                                        />
                                        <text x="20" y="24" textAnchor="middle" fontSize="8" fontWeight="bold" fill="#334155">
                                            {Math.round(frac * 100)}%
                                        </text>
                                    </svg>
                                );
                            })()}
                        </button>

                        <div className="w-8 border-t border-slate-100" />

                        {/* Order mini-chips */}
                        {filteredOrders.map(order => (
                            <button
                                key={order.id}
                                onClick={() => { selectOrder(order.id); setSidebarOpen(true); }}
                                title={`#${order.order_number}${order.customer_name ? ` · ${order.customer_name}` : ''}`}
                                className={`w-8 h-8 rounded-lg flex items-center justify-center text-[9px] font-bold transition-colors shrink-0 ${
                                    selectedOrderId === order.id
                                        ? 'bg-violet-100 text-violet-700 ring-2 ring-violet-400'
                                        : 'bg-slate-100 text-slate-500 hover:bg-violet-50 hover:text-violet-600'
                                }`}
                            >
                                {String(order.order_number || '').slice(-3)}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* ── RIGHT: Detail panel ── */}
            <div className="flex-1 overflow-y-auto">
                {!selectedOrderId && (
                    <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-3">
                        <ShoppingBag size={52} className="opacity-20" />
                        <p className="text-sm font-medium">Select a sales order to start planning</p>
                    </div>
                )}

                {selectedOrderId && loadingOrder && <Spinner />}

                {selectedOrderId && !loadingOrder && orderDetail && (
                    workspaceSop ? (
                        <MerchandiserSopWorkspace
                            sop={workspaceSop}
                            salesOrder={orderDetail}
                            bomOptions={bomsByProduct[String(workspaceSop.product_id)] || bomsByProduct[workspaceSop.product_id] || []}
                            fabricTypes={fabricTypes}
                            onLinkBom={handleLink}
                            onPreviewBom={setPreviewBomId}
                            onSopChanged={handleSopChanged}
                            onBack={() => setOpenWorkspaceSopId(null)}
                        />
                    ) : (
                        <SopListPanel
                            orderDetail={orderDetail}
                            sops={sops}
                            unlinkedCount={unlinkedCount}
                            bomsByProduct={bomsByProduct}
                            fabricTypes={fabricTypes}
                            linking={linking}
                            onLink={handleLink}
                            onUnlink={handleUnlink}
                            onPreview={setPreviewBomId}
                            onReadinessChange={handleSopChanged}
                            onOpenWorkspace={setOpenWorkspaceSopId}
                        />
                    )
                )}
            </div>
        </div>

        {previewBomId && (
            <BomPreviewModal bomId={previewBomId} onClose={() => setPreviewBomId(null)} />
        )}
        </>
    );
};

export default ProductionPlanningPage;

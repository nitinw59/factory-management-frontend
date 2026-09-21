// src/modules/merchandiser/MerchandiserPlanningPage.jsx
//
// Route entry point (kept at this path/export name — see App.js's 3 routes).
// Full-page order-tracking list: every sales order is a collapsible group of
// SopTrailRows, each rendering its product line's lifecycle as a 6-node
// interactive trail (Order Details -> BOM -> Requirements -> Fabric -> Trim ->
// Ready). Each node opens its own focused overlay instead of one shared
// workspace: OrderDetailOverlay, BomStageModal, RequirementsStageModal,
// ReadinessStageModal (all centered modals), and WorkspaceDrawer — a
// full-screen requirements grid, scoped to just Fabric or just Trim — for
// the two nodes that need the room.
//
// Multiple orders can be expanded at once — either by click, or automatically
// as they scroll into view (see OrderTrailGroup's IntersectionObserver). So
// order detail is a per-order cache (orderDetails[orderId]), not a single
// slot, and every stage overlay carries the orderId it belongs to (captured
// at the moment its node was clicked) so a mutation refreshes the right
// order's cache — sop.id alone doesn't say which order it came from once more
// than one can be expanded.

import { useState, useEffect, useCallback } from 'react';
import { planningApi } from '../../api/planningApi';
import { Spinner } from './merchandiserShared';
import BomPreviewModal from './BomPreviewModal';
import OrderTrailGroup from './OrderTrailGroup';
import OrderDetailOverlay from './OrderDetailOverlay';
import BomStageModal from './BomStageModal';
import RequirementsStageModal from './RequirementsStageModal';
import ReadinessStageModal from './ReadinessStageModal';
import WorkspaceDrawer from './WorkspaceDrawer';

const MerchandiserPlanningPage = () => {
    const [formData,    setFormData]    = useState(null);
    const [loadingForm, setLoadingForm] = useState(true);
    const [formErr,     setFormErr]     = useState(null);

    const [expandedOrderIds, setExpandedOrderIds] = useState(() => new Set());
    const [orderDetails,     setOrderDetails]     = useState({}); // { [orderId]: detail }
    const [loadingOrderIds,  setLoadingOrderIds]  = useState(() => new Set());

    const [searchQ,      setSearchQ]      = useState('');
    const [filterStatus, setFilterStatus] = useState('ALL');
    const [needsBomOnly, setNeedsBomOnly] = useState(false);

    const [previewBomId,      setPreviewBomId]      = useState(null);
    const [workspaceTarget,   setWorkspaceTarget]   = useState(null); // { sopId, orderId, scope: 'fabric'|'trim' } | null
    const [orderOverlay,      setOrderOverlay]      = useState(null); // { sopId, orderId } | null
    const [bomStage,          setBomStage]          = useState(null); // { sopId, orderId } | null
    const [requirementsStage, setRequirementsStage] = useState(null); // { sopId, orderId } | null
    const [readinessStage,    setReadinessStage]    = useState(null); // { sopId, orderId } | null

    // For the Secondary Fabric picker in LinkAndAllocateModal — only needed when a BOM has
    // a generic SECONDARY fabric line, but cheap enough to load once up front.
    const [fabricTypes, setFabricTypes] = useState([]);

    useEffect(() => {
        planningApi.getFormData()
            .then(res => setFormData(res.data?.data ?? res.data))
            .catch(e  => setFormErr(e?.response?.data?.error || e?.response?.data?.message || 'Failed to load planning data'))
            .finally(() => setLoadingForm(false));
        planningApi.getFabricTypes()
            .then(res => setFabricTypes(res.data?.data ?? res.data ?? []))
            .catch(e  => console.error('Failed to load fabric types', e));
    }, []);

    // Refetches one order's own detail (and the sidebar-summary formData) —
    // used both for the initial expand fetch and to re-sync after a mutation.
    const refreshOrder = useCallback(async (orderId) => {
        setLoadingOrderIds(prev => new Set(prev).add(orderId));
        try {
            const [detailRes, fdRes] = await Promise.all([
                planningApi.getOrderDetail(orderId),
                planningApi.getFormData(),
            ]);
            setOrderDetails(prev => ({ ...prev, [orderId]: detailRes.data?.data ?? detailRes.data }));
            setFormData(fdRes.data?.data ?? fdRes.data);
        } catch (e) {
            console.error('Order detail fetch failed', e);
        } finally {
            setLoadingOrderIds(prev => { const next = new Set(prev); next.delete(orderId); return next; });
        }
    }, []);

    // Idempotent — expanding an already-expanded (or already-loading) order is
    // a no-op, so both the click handler and the scroll-triggered auto-expand
    // can call this freely without double-fetching.
    const expandOrder = useCallback((orderId) => {
        setExpandedOrderIds(prev => {
            if (prev.has(orderId)) return prev;
            const next = new Set(prev).add(orderId);
            return next;
        });
        setOrderDetails(prev => {
            if (prev[orderId] !== undefined) return prev; // already cached — no refetch
            refreshOrder(orderId);
            return prev;
        });
    }, [refreshOrder]);

    const collapseOrder = useCallback((orderId) => {
        setExpandedOrderIds(prev => { const next = new Set(prev); next.delete(orderId); return next; });
    }, []);

    const toggleOrder = useCallback((orderId) => {
        if (expandedOrderIds.has(orderId)) collapseOrder(orderId);
        else expandOrder(orderId);
    }, [expandedOrderIds, collapseOrder, expandOrder]);

    const handleLink = useCallback(async (sopId, bomId, secondaryFabricTypeId, orderId) => {
        const res = await planningApi.linkBom(sopId, {
            bom_id: bomId,
            secondary_fabric_type_id: secondaryFabricTypeId,
        });
        await refreshOrder(orderId);
        return res?.data;
    }, [refreshOrder]);

    // Generic "please re-sync this order" signal — used after a readiness
    // toggle, a BOM link/unlink, or any mutation inside the SOP workspace
    // (reserve, release, recalculate, raise PR) that might have changed
    // bom_id or production_readiness.
    const handleSopChanged = useCallback((orderId) => {
        if (orderId) refreshOrder(orderId);
    }, [refreshOrder]);

    const onOpenStage = useCallback((sop, stageKey, orderId) => {
        switch (stageKey) {
            case 'order':        setOrderOverlay({ sopId: sop.id, orderId }); break;
            case 'bom':          setBomStage({ sopId: sop.id, orderId }); break;
            case 'requirements': setRequirementsStage({ sopId: sop.id, orderId }); break;
            case 'fabric':       setWorkspaceTarget({ sopId: sop.id, orderId, scope: 'fabric' }); break;
            case 'trim':         setWorkspaceTarget({ sopId: sop.id, orderId, scope: 'trim' }); break;
            case 'ready':        setReadinessStage({ sopId: sop.id, orderId }); break;
            default: break;
        }
    }, []);

    const orders        = formData?.sales_orders    || [];
    const bomsByProduct = formData?.boms_by_product  || {};
    const bomOptionsFor = (sop) => (sop ? (bomsByProduct[String(sop.product_id)] || bomsByProduct[sop.product_id] || []) : []);

    // Always re-derive from the latest cached orderDetails (rather than a
    // snapshot captured at click time) so each overlay reflects any mutation
    // (link/unlink, recalc, readiness toggle) made while it's open. sop.id is
    // a global primary key, so searching every currently-cached order's
    // products (instead of tracking "which order" separately) is sufficient.
    const sopById = (sopId) => {
        for (const detail of Object.values(orderDetails)) {
            const match = detail?.products?.find(s => s.id === sopId);
            if (match) return match;
        }
        return null;
    };
    const workspaceSop          = workspaceTarget   ? sopById(workspaceTarget.sopId)   : null;
    const orderOverlaySop       = orderOverlay      ? sopById(orderOverlay.sopId)      : null;
    const bomStageSop           = bomStage          ? sopById(bomStage.sopId)          : null;
    const requirementsStageSop  = requirementsStage ? sopById(requirementsStage.sopId) : null;
    const readinessStageSop     = readinessStage    ? sopById(readinessStage.sopId)    : null;

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
        <div className="h-full overflow-y-auto bg-slate-50">
            <div className="max-w-5xl mx-auto px-4 py-5">
                {/* Search + filters */}
                <div className="mb-4">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
                        <input
                            type="search"
                            placeholder="Search order or buyer…"
                            value={searchQ}
                            onChange={e => setSearchQ(e.target.value)}
                            className="w-full sm:w-72 text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-violet-400"
                        />
                        <div className="flex flex-wrap items-center gap-1">
                            {['ALL', 'DRAFT', 'CONFIRMED', 'IN_PRODUCTION', 'SHIPPED', 'CANCELLED'].map(s => (
                                <button
                                    key={s}
                                    onClick={() => setFilterStatus(s)}
                                    className={`px-2 py-1 rounded-md text-[10px] font-bold transition-colors ${
                                        filterStatus === s ? 'bg-violet-600 text-white shadow-sm' : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-100'
                                    }`}
                                >
                                    {s === 'ALL' ? 'All' : s.replace(/_/g, ' ')}
                                </button>
                            ))}
                            <button
                                onClick={() => setNeedsBomOnly(v => !v)}
                                title="Only orders with at least one product line missing a BOM link"
                                className={`px-2 py-1 rounded-md text-[10px] font-bold transition-colors sm:ml-2 ${
                                    needsBomOnly ? 'bg-amber-500 text-white shadow-sm' : 'bg-amber-50 text-amber-600 border border-amber-100 hover:bg-amber-100'
                                }`}
                            >
                                Needs BOM
                            </button>
                        </div>
                    </div>
                </div>

                {/* Order list */}
                {loadingForm && <Spinner h={48} />}
                {formErr && <p className="text-xs text-red-500 px-1 py-3">{formErr}</p>}
                {!loadingForm && filteredOrders.length === 0 && (
                    <p className="text-sm text-slate-400 text-center py-16">No orders found</p>
                )}
                <div className="space-y-2.5">
                    {filteredOrders.map(order => (
                        <OrderTrailGroup
                            key={order.id}
                            order={order}
                            isExpanded={expandedOrderIds.has(order.id)}
                            onToggle={() => toggleOrder(order.id)}
                            onEnterView={() => expandOrder(order.id)}
                            orderDetail={orderDetails[order.id] || null}
                            loadingOrder={loadingOrderIds.has(order.id)}
                            onOpenStage={(sop, stageKey) => onOpenStage(sop, stageKey, order.id)}
                        />
                    ))}
                </div>
            </div>

            {orderOverlaySop && (
                <OrderDetailOverlay
                    sop={orderOverlaySop}
                    salesOrder={orderDetails[orderOverlay.orderId]}
                    onClose={() => setOrderOverlay(null)}
                />
            )}

            {bomStageSop && (
                <BomStageModal
                    sop={bomStageSop}
                    bomOptions={bomOptionsFor(bomStageSop)}
                    fabricTypes={fabricTypes}
                    onLink={(sopId, bomIdVal, secondaryFabricTypeId) => handleLink(sopId, bomIdVal, secondaryFabricTypeId, bomStage.orderId)}
                    onPreview={setPreviewBomId}
                    onDone={() => handleSopChanged(bomStage.orderId)}
                    onClose={() => setBomStage(null)}
                />
            )}

            {requirementsStageSop && (
                <RequirementsStageModal
                    sop={requirementsStageSop}
                    fabricTypes={fabricTypes}
                    onDone={() => handleSopChanged(requirementsStage.orderId)}
                    onClose={() => setRequirementsStage(null)}
                />
            )}

            {readinessStageSop && (
                <ReadinessStageModal
                    sop={readinessStageSop}
                    onDone={() => handleSopChanged(readinessStage.orderId)}
                    onClose={() => setReadinessStage(null)}
                />
            )}

            {workspaceSop && (
                <WorkspaceDrawer
                    sop={workspaceSop}
                    salesOrder={orderDetails[workspaceTarget.orderId]}
                    scope={workspaceTarget.scope}
                    onSopChanged={() => handleSopChanged(workspaceTarget.orderId)}
                    onClose={() => setWorkspaceTarget(null)}
                />
            )}

            {previewBomId && (
                <BomPreviewModal bomId={previewBomId} onClose={() => setPreviewBomId(null)} />
            )}
        </div>
    );
};

export default MerchandiserPlanningPage;

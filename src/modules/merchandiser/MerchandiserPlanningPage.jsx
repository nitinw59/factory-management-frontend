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

    const [expandedOrderId, setExpandedOrderId] = useState(null);
    const [orderDetail,     setOrderDetail]     = useState(null);
    const [loadingOrder,    setLoadingOrder]    = useState(false);

    const [searchQ,      setSearchQ]      = useState('');
    const [filterStatus, setFilterStatus] = useState('ALL');
    const [needsBomOnly, setNeedsBomOnly] = useState(false);

    const [previewBomId,      setPreviewBomId]      = useState(null);
    const [workspaceTarget,   setWorkspaceTarget]   = useState(null); // { sopId, scope: 'fabric'|'trim' } | null
    const [orderOverlaySopId,       setOrderOverlaySopId]       = useState(null); // sopId | null
    const [bomStageSopId,           setBomStageSopId]           = useState(null); // sopId | null
    const [requirementsStageSopId,  setRequirementsStageSopId]  = useState(null); // sopId | null
    const [readinessStageSopId,     setReadinessStageSopId]     = useState(null); // sopId | null

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

    const refreshOrder = useCallback(async (orderId) => {
        const [detailRes, fdRes] = await Promise.all([
            planningApi.getOrderDetail(orderId),
            planningApi.getFormData(),
        ]);
        setOrderDetail(detailRes.data?.data ?? detailRes.data);
        setFormData(fdRes.data?.data ?? fdRes.data);
    }, []);

    const toggleOrder = useCallback((orderId) => {
        if (orderId === expandedOrderId) {
            setExpandedOrderId(null);
            setOrderDetail(null);
            return;
        }
        setExpandedOrderId(orderId);
        setOrderDetail(null);
        setLoadingOrder(true);
        planningApi.getOrderDetail(orderId)
            .then(res => setOrderDetail(res.data?.data ?? res.data))
            .catch(e  => console.error('Order detail fetch failed', e))
            .finally(() => setLoadingOrder(false));
    }, [expandedOrderId]);

    const handleLink = useCallback(async (sopId, bomId, secondaryFabricTypeId = null) => {
        const res = await planningApi.linkBom(sopId, {
            bom_id: bomId,
            secondary_fabric_type_id: secondaryFabricTypeId,
        });
        await refreshOrder(expandedOrderId);
        return res?.data;
    }, [expandedOrderId, refreshOrder]);

    // Generic "please re-sync this order" signal — used after a readiness
    // toggle, a BOM link/unlink, or any mutation inside the SOP workspace
    // (reserve, release, recalculate, raise PR) that might have changed
    // bom_id or production_readiness.
    const handleSopChanged = useCallback(() => {
        if (expandedOrderId) refreshOrder(expandedOrderId);
    }, [expandedOrderId, refreshOrder]);

    const onOpenStage = useCallback((sop, stageKey) => {
        switch (stageKey) {
            case 'order':        setOrderOverlaySopId(sop.id); break;
            case 'bom':          setBomStageSopId(sop.id); break;
            case 'requirements': setRequirementsStageSopId(sop.id); break;
            case 'fabric':       setWorkspaceTarget({ sopId: sop.id, scope: 'fabric' }); break;
            case 'trim':         setWorkspaceTarget({ sopId: sop.id, scope: 'trim' }); break;
            case 'ready':        setReadinessStageSopId(sop.id); break;
            default: break;
        }
    }, []);

    const orders        = formData?.sales_orders    || [];
    const bomsByProduct = formData?.boms_by_product  || {};
    const bomOptionsFor = (sop) => (sop ? (bomsByProduct[String(sop.product_id)] || bomsByProduct[sop.product_id] || []) : []);

    // Always re-derive from the latest orderDetail (rather than a snapshot
    // captured at click time) so each overlay reflects any mutation
    // (link/unlink, recalc, readiness toggle) made while it's open.
    const sops                  = orderDetail?.products || [];
    const workspaceSop          = workspaceTarget          ? sops.find(s => s.id === workspaceTarget.sopId)  : null;
    const orderOverlaySop       = orderOverlaySopId        ? sops.find(s => s.id === orderOverlaySopId)      : null;
    const bomStageSop           = bomStageSopId            ? sops.find(s => s.id === bomStageSopId)          : null;
    const requirementsStageSop  = requirementsStageSopId   ? sops.find(s => s.id === requirementsStageSopId) : null;
    const readinessStageSop     = readinessStageSopId      ? sops.find(s => s.id === readinessStageSopId)    : null;

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
                            isExpanded={expandedOrderId === order.id}
                            onToggle={() => toggleOrder(order.id)}
                            orderDetail={expandedOrderId === order.id ? orderDetail : null}
                            loadingOrder={expandedOrderId === order.id && loadingOrder}
                            onOpenStage={onOpenStage}
                        />
                    ))}
                </div>
            </div>

            {orderOverlaySop && (
                <OrderDetailOverlay
                    sop={orderOverlaySop}
                    salesOrder={orderDetail}
                    onClose={() => setOrderOverlaySopId(null)}
                />
            )}

            {bomStageSop && (
                <BomStageModal
                    sop={bomStageSop}
                    bomOptions={bomOptionsFor(bomStageSop)}
                    fabricTypes={fabricTypes}
                    onLink={handleLink}
                    onPreview={setPreviewBomId}
                    onDone={handleSopChanged}
                    onClose={() => setBomStageSopId(null)}
                />
            )}

            {requirementsStageSop && (
                <RequirementsStageModal
                    sop={requirementsStageSop}
                    fabricTypes={fabricTypes}
                    onDone={handleSopChanged}
                    onClose={() => setRequirementsStageSopId(null)}
                />
            )}

            {readinessStageSop && (
                <ReadinessStageModal
                    sop={readinessStageSop}
                    onDone={handleSopChanged}
                    onClose={() => setReadinessStageSopId(null)}
                />
            )}

            {workspaceSop && (
                <WorkspaceDrawer
                    sop={workspaceSop}
                    salesOrder={orderDetail}
                    scope={workspaceTarget.scope}
                    onSopChanged={handleSopChanged}
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

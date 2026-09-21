// ─── ORDER TRAIL GROUP ───────────────────────────────────────────────────────
// One sales order as a collapsible section in the full-page planning list:
// order-identity header (replaces the old narrow-sidebar OrderCard) which
// expands in place to reveal one SopTrailRow per product line. Expanding
// triggers the order-detail fetch lazily (same planningApi.getOrderDetail
// call the old sidebar's selectOrder made) — only the currently-expanded
// order's products are ever fetched.

import { ChevronDown, ShoppingBag } from 'lucide-react';
import { Spinner } from './merchandiserShared';
import SopTrailRow from './SopTrailRow';

// Matches the backend's sales_order_status enum exactly: DRAFT, CONFIRMED,
// IN_PRODUCTION, SHIPPED, CANCELLED.
const ORDER_STATUS_CFG = {
    DRAFT:          { cls: 'bg-slate-100 text-slate-500'   },
    CONFIRMED:      { cls: 'bg-blue-100 text-blue-700'     },
    IN_PRODUCTION:  { cls: 'bg-violet-100 text-violet-700' },
    SHIPPED:        { cls: 'bg-emerald-100 text-emerald-700'},
    CANCELLED:      { cls: 'bg-red-100 text-red-500'       },
};

const OrderTrailGroup = ({ order, isExpanded, onToggle, orderDetail, loadingOrder, onOpenStage }) => {
    const { cls } = ORDER_STATUS_CFG[order.status] || { cls: 'bg-gray-100 text-gray-500' };
    const linked = order.linked_bom_count ?? 0;
    const total  = order.product_count    ?? 0;
    const allLinked = linked === total && total > 0;
    const customerName = order.customer_name || order.buyer_name || '—';

    const sops = isExpanded ? (orderDetail?.products || []) : [];

    return (
        <div className={`bg-white border rounded-xl overflow-hidden transition-colors ${isExpanded ? 'border-violet-300 shadow-sm' : 'border-slate-200'}`}>
            <button
                type="button"
                onClick={onToggle}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 transition-colors"
            >
                <ShoppingBag size={16} className="text-slate-300 shrink-0" />

                <div className="min-w-0 flex-1 flex items-center flex-wrap gap-x-3 gap-y-1">
                    <span className="font-bold text-slate-800 text-sm shrink-0">
                        {order.order_number}
                        {order.buyer_po_number && (
                            <span className="font-normal text-slate-400 ml-1 text-[10px]">· PO {order.buyer_po_number}</span>
                        )}
                    </span>
                    <span className="text-xs text-slate-500 truncate">{customerName}</span>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase shrink-0 ${cls}`}>
                        {order.status}
                    </span>
                    <span className={`text-[10px] font-bold shrink-0 ${allLinked ? 'text-emerald-600' : 'text-amber-600'}`}>
                        {linked}/{total} BOMs linked
                    </span>
                    {order.delivery_date && (
                        <span className="text-[10px] text-slate-400 shrink-0">
                            Due {new Date(order.delivery_date).toLocaleDateString()}
                        </span>
                    )}
                </div>

                <ChevronDown size={15} className={`text-slate-400 shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
            </button>

            {isExpanded && (
                loadingOrder ? (
                    <Spinner h={24} />
                ) : sops.length === 0 ? (
                    <p className="text-xs text-slate-400 text-center py-6 border-t border-slate-100">No product lines on this order</p>
                ) : (
                    sops.map(sop => (
                        <SopTrailRow key={sop.id} sop={sop} onOpenStage={onOpenStage} />
                    ))
                )
            )}
        </div>
    );
};

export default OrderTrailGroup;

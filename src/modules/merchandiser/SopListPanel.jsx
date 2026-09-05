// ─── SOP LIST PANEL ─────────────────────────────────────────────────────────
// The selected order's detail header + the "Product–BOM Links" list of
// SopSummaryCards. Shown in the page's right panel until a product line's
// workspace is opened (see MerchandiserPlanningPage / MerchandiserSopWorkspace).

import { AlertTriangle, CheckCircle2, Link2 } from 'lucide-react';
import SopSummaryCard from './SopSummaryCard';

const Section = ({ icon: Icon, iconCls, title, badge, children }) => (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
                <Icon size={16} className={iconCls} />
                <h3 className="font-bold text-slate-800 text-sm">{title}</h3>
            </div>
            {badge}
        </div>
        <div className="p-5">{children}</div>
    </div>
);

const SopListPanel = ({ orderDetail, sops, unlinkedCount, bomsByProduct, fabricTypes, linking, onLink, onUnlink, onPreview, onReadinessChange, onOpenWorkspace }) => (
    <div className="p-6 space-y-5">
        {/* Order header */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                    <div className="flex items-baseline gap-2">
                        <h2 className="font-extrabold text-slate-800 text-xl">Order #{orderDetail.order_number}</h2>
                        {orderDetail.buyer_po_number && (
                            <span className="text-sm text-slate-400">PO {orderDetail.buyer_po_number}</span>
                        )}
                    </div>
                    <p className="text-sm text-slate-500 mt-0.5">
                        {orderDetail.customer_name || orderDetail.buyer_name || '—'}
                    </p>
                </div>
                {unlinkedCount > 0 ? (
                    <span className="text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg flex items-center gap-1.5 shrink-0">
                        <AlertTriangle size={13} /> {unlinkedCount} product{unlinkedCount > 1 ? 's' : ''} without BOM
                    </span>
                ) : (
                    <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg flex items-center gap-1.5 shrink-0">
                        <CheckCircle2 size={13} /> All BOMs linked
                    </span>
                )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                    { label: 'Delivery Date', val: orderDetail.delivery_date ? new Date(orderDetail.delivery_date).toLocaleDateString() : '—' },
                    { label: 'Status',        val: orderDetail.status || '—' },
                    { label: 'Products',      val: sops.length },
                    { label: 'Order Value',   val: orderDetail.total_amount ? `₹${Number(orderDetail.total_amount).toLocaleString()}` : '—' },
                ].map(({ label, val }) => (
                    <div key={label} className="bg-slate-50 rounded-xl p-3">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">{label}</p>
                        <p className="font-semibold text-slate-700 text-sm">{val}</p>
                    </div>
                ))}
            </div>
        </div>

        {/* Product–BOM Links */}
        <Section
            icon={Link2}
            iconCls="text-violet-500"
            title="Product–BOM Links"
            badge={
                <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5 bg-slate-100 rounded-full px-3 py-1">
                        {Array.from({ length: sops.length }).map((_, i) => (
                            <span key={i}
                                className={`inline-block w-2 h-2 rounded-full transition-colors ${
                                    i < (sops.length - unlinkedCount) ? 'bg-emerald-500' : 'bg-slate-300'
                                }`}
                            />
                        ))}
                    </div>
                    <span className={`text-xs font-bold ${unlinkedCount === 0 ? 'text-emerald-600' : 'text-amber-600'}`}>
                        {sops.length - unlinkedCount}/{sops.length} linked
                    </span>
                </div>
            }
        >
            <div className="space-y-3">
                {sops.map(sop => (
                    <SopSummaryCard
                        key={sop.id}
                        sop={sop}
                        salesOrder={orderDetail}
                        bomOptions={bomsByProduct[String(sop.product_id)] || bomsByProduct[sop.product_id] || []}
                        fabricTypes={fabricTypes}
                        onLink={onLink}
                        onUnlink={onUnlink}
                        onPreview={onPreview}
                        isLinking={!!linking[sop.id]}
                        onReadinessChange={onReadinessChange}
                        onOpenWorkspace={onOpenWorkspace}
                    />
                ))}
            </div>
        </Section>
    </div>
);

export default SopListPanel;

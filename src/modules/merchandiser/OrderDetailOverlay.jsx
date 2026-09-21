// ─── ORDER DETAIL OVERLAY ────────────────────────────────────────────────────
// Read-only SO-level detail shown from a SOP trail's first ("Order Details")
// node — order/PO/buyer/delivery info plus this line's own colors and sizes.
// Pure display; every field already exists on orderDetail/sop, no API call.

import { X } from 'lucide-react';
import { dedupeColorsById } from './merchandiserShared';

const OrderDetailOverlay = ({ sop, salesOrder, onClose }) => {
    const colors = dedupeColorsById(sop.colors || []);
    const totalQty = colors.reduce((s, c) => s + (c.quantity || c.total_quantity || 0), 0);

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[85vh]" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
                    <div>
                        <h3 className="font-extrabold text-slate-800 text-base">
                            {salesOrder?.order_number ? `Order #${salesOrder.order_number}` : 'Order Details'}
                        </h3>
                        <p className="text-xs text-slate-400 mt-0.5">{sop.product_name}</p>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-700 transition-colors">
                        <X size={18} />
                    </button>
                </div>

                <div className="overflow-y-auto px-5 py-4 space-y-4">
                    <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Buyer</p>
                            <p className="font-semibold text-slate-700">{salesOrder?.customer_name || salesOrder?.buyer_name || '—'}</p>
                        </div>
                        <div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Buyer PO</p>
                            <p className="font-semibold text-slate-700">{salesOrder?.buyer_po_number || '—'}</p>
                        </div>
                        <div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Status</p>
                            <p className="font-semibold text-slate-700">{salesOrder?.status || '—'}</p>
                        </div>
                        <div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Delivery Date</p>
                            <p className="font-semibold text-slate-700">
                                {salesOrder?.delivery_date ? new Date(salesOrder.delivery_date).toLocaleDateString() : '—'}
                            </p>
                        </div>
                    </div>

                    <div className="border-t border-slate-100 pt-3">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                            {sop.product_name} — {colors.length} color{colors.length !== 1 ? 's' : ''} · {totalQty.toLocaleString()} pcs
                        </p>
                        <div className="space-y-2">
                            {colors.map(c => {
                                const ordered = Number(c.quantity ?? c.total_quantity ?? 0);
                                return (
                                    <div key={c.fabric_color_id} className="bg-slate-50 border border-slate-200 rounded-xl p-2.5">
                                        <p className="text-xs font-bold text-slate-700 mb-1.5">
                                            {c.color_number || c.color_name}
                                            {c.color_number && c.color_name && (
                                                <span className="font-normal text-slate-400 ml-1">#{c.color_name}</span>
                                            )}
                                            <span className="font-normal text-slate-400 ml-1">· {ordered.toLocaleString()} pcs</span>
                                        </p>
                                        <div className="flex flex-wrap gap-1.5">
                                            {(c.sizes || []).filter(sz => Number(sz.quantity) > 0).map(sz => (
                                                <span key={sz.size_id ?? sz.size_name} className="text-[10px] bg-white border border-slate-200 px-1.5 py-0.5 rounded font-bold text-slate-600">
                                                    {sz.size_name || sz.size_id} × {Number(sz.quantity).toLocaleString()}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                            {colors.length === 0 && <p className="text-xs text-slate-400 italic">No color/size breakdown available.</p>}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default OrderDetailOverlay;

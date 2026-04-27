import { useState, useEffect, useCallback } from 'react';
import {
    Loader2, Link2, ChevronDown, ChevronRight,
    Package, AlertTriangle, CheckCircle2, RefreshCw,
    Calculator, ShoppingBag, X, AlertCircle, Layers,
} from 'lucide-react';
import { planningApi } from '../../api/planningApi';

// ─── HELPERS ──────────────────────────────────────────────────────────────────

const Spinner = ({ h = 64 }) => (
    <div className={`flex justify-center items-center`} style={{ minHeight: h * 4 }}>
        <Loader2 className="animate-spin h-7 w-7 text-violet-500" />
    </div>
);

const fmt = (n) => Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });

const ORDER_STATUS_CFG = {
    DRAFT:          { cls: 'bg-slate-100 text-slate-500'   },
    CONFIRMED:      { cls: 'bg-blue-100 text-blue-700'     },
    IN_PRODUCTION:  { cls: 'bg-violet-100 text-violet-700' },
    COMPLETED:      { cls: 'bg-emerald-100 text-emerald-700'},
    CANCELLED:      { cls: 'bg-red-100 text-red-500'       },
};

// ─── ORDER CARD (left sidebar) ─────────────────────────────────────────────────

const OrderCard = ({ order, isSelected, onClick }) => {
    const { cls } = ORDER_STATUS_CFG[order.status] || { cls: 'bg-gray-100 text-gray-500' };
    const linked    = order.linked_bom_count ?? 0;
    const total     = order.product_count    ?? 0;
    const allLinked = linked === total && total > 0;
    const customerName = order.customer_name || order.buyer_name || '—';

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
            <p className="text-[11px] text-slate-500 mb-1.5 truncate">{customerName}</p>
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

// ─── SOP CARD (product → BOM link) ────────────────────────────────────────────

const SopCard = ({ sop, bomOptions, onLink, onUnlink, isLinking }) => {
    const [showPicker,    setShowPicker]    = useState(false);
    const [pickedBomId,   setPickedBomId]   = useState('');
    const [confirmUnlink, setConfirmUnlink] = useState(false);

    const linkedBomDetail = bomOptions.find(b => b.id === sop.bom_id);
    const totalQty        = (sop.colors || []).reduce((s, c) => s + (c.quantity || c.total_quantity || 0), 0);
    const sizeEntries     = Object.entries(sop.size_breakdown || {}).filter(([, v]) => v > 0);

    const confirmLink = () => {
        if (!pickedBomId) return;
        onLink(sop.id, parseInt(pickedBomId, 10));
        setShowPicker(false);
        setPickedBomId('');
    };

    const doUnlink = () => {
        setConfirmUnlink(false);
        onUnlink(sop.id);
    };

    return (
        <div className={`border rounded-xl overflow-hidden transition-colors ${sop.bom_id ? 'border-emerald-200' : 'border-slate-200'}`}>

            {/* ── Row 1: product name + status badge ── */}
            <div className={`flex items-center justify-between gap-3 px-4 py-3 ${sop.bom_id ? 'bg-emerald-50/50' : 'bg-slate-50'}`}>
                <div>
                    <p className="font-bold text-slate-800 text-sm">{sop.product_name}</p>
                    <div className="flex items-center flex-wrap gap-2 mt-0.5">
                        {sop.fabric_type_name && (
                            <span className="text-[10px] text-slate-500">{sop.fabric_type_name}</span>
                        )}
                        <span className="text-[10px] text-slate-400">
                            {sop.colors?.length || 0} color{(sop.colors?.length || 0) !== 1 ? 's' : ''} · {totalQty.toLocaleString()} pcs
                        </span>
                    </div>
                    {sizeEntries.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                            {sizeEntries.map(([size, qty]) => (
                                <span key={size} className="text-[9px] bg-slate-100 text-slate-600 border border-slate-200 px-1.5 py-0.5 rounded font-bold">
                                    {size}×{qty}
                                </span>
                            ))}
                        </div>
                    )}
                </div>
                {sop.bom_id ? (
                    <span className="text-[9px] bg-emerald-100 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full font-bold uppercase flex items-center gap-1 shrink-0">
                        <CheckCircle2 size={9} /> BOM Linked
                    </span>
                ) : (
                    <span className="text-[9px] bg-amber-50 text-amber-600 border border-amber-200 px-2 py-0.5 rounded-full font-bold uppercase flex items-center gap-1 shrink-0">
                        <AlertTriangle size={9} /> No BOM
                    </span>
                )}
            </div>

            {/* ── Row 2: color chips ── */}
            {(sop.colors || []).length > 0 && (
                <div className="px-4 py-2.5 border-t border-slate-100 flex flex-wrap gap-1.5">
                    {sop.colors.map(c => (
                        <span key={c.fabric_color_id}
                            className="text-[10px] bg-indigo-50 text-indigo-700 border border-indigo-100 px-2 py-0.5 rounded-md font-bold">
                            {c.color_number || c.color_name}
                            {c.color_number && c.color_name && (
                                <span className="font-normal text-indigo-400 ml-1">#{c.color_name}</span>
                            )}
                            {' '}· {(c.quantity || c.total_quantity || 0).toLocaleString()} pcs
                        </span>
                    ))}
                </div>
            )}

            {/* ── Row 3: BOM section ── */}
            <div className="px-4 py-3 border-t border-slate-100">
                {sop.bom_id ? (
                    /* ── LINKED STATE ── */
                    <div className="flex items-start justify-between gap-3 bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                        <div className="flex items-start gap-2 min-w-0">
                            <CheckCircle2 size={15} className="text-emerald-600 mt-0.5 shrink-0" />
                            <div className="min-w-0">
                                <p className="font-bold text-emerald-900 text-sm">{sop.bom_name}</p>
                                {(linkedBomDetail?.ratio_groups || []).length > 0 && (
                                    <div className="flex flex-wrap gap-1 mt-1">
                                        {linkedBomDetail.ratio_groups.map((rg, i) => (
                                            <span key={i}
                                                className="text-[9px] bg-white text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded font-bold">
                                                {rg.ratio_group_name}
                                            </span>
                                        ))}
                                    </div>
                                )}
                                {linkedBomDetail && (
                                    <p className="text-[10px] text-emerald-600/70 mt-1">
                                        {[
                                            linkedBomDetail.fabric_consumptions?.length > 0 && `${linkedBomDetail.fabric_consumptions.length} fabric type${linkedBomDetail.fabric_consumptions.length > 1 ? 's' : ''}`,
                                            linkedBomDetail.material_consumptions?.length > 0 && `${linkedBomDetail.material_consumptions.length} material${linkedBomDetail.material_consumptions.length > 1 ? 's' : ''}`,
                                        ].filter(Boolean).join(' · ')}
                                    </p>
                                )}
                            </div>
                        </div>

                        {/* Unlink control */}
                        {isLinking ? (
                            <Loader2 size={14} className="animate-spin text-slate-400 shrink-0 mt-0.5" />
                        ) : !confirmUnlink ? (
                            <button
                                onClick={() => setConfirmUnlink(true)}
                                className="text-[10px] text-slate-400 hover:text-red-600 flex items-center gap-1 hover:bg-red-50 px-2 py-1 rounded-lg transition-colors shrink-0"
                            >
                                <X size={11} /> Unlink
                            </button>
                        ) : (
                            <div className="flex items-center gap-1.5 shrink-0">
                                <span className="text-[10px] text-slate-600 font-medium">Remove?</span>
                                <button onClick={doUnlink}
                                    className="text-[10px] font-bold text-white bg-red-500 hover:bg-red-600 px-2 py-0.5 rounded transition-colors">
                                    Yes
                                </button>
                                <button onClick={() => setConfirmUnlink(false)}
                                    className="text-[10px] font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 px-2 py-0.5 rounded transition-colors">
                                    No
                                </button>
                            </div>
                        )}
                    </div>
                ) : (
                    /* ── UNLINKED STATE ── */
                    !showPicker ? (
                        <button
                            onClick={() => setShowPicker(true)}
                            disabled={isLinking}
                            className="w-full flex items-center justify-center gap-2 text-sm font-bold text-violet-600 bg-violet-50 hover:bg-violet-100 border border-violet-200 border-dashed px-3 py-2.5 rounded-xl transition-colors disabled:opacity-40"
                        >
                            {isLinking ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />}
                            Link a BOM
                        </button>
                    ) : (
                        <div>
                            <div className="flex items-center justify-between mb-2.5">
                                <p className="text-xs font-bold text-slate-700">Select an approved BOM:</p>
                                <button onClick={() => { setShowPicker(false); setPickedBomId(''); }}
                                    className="text-slate-400 hover:text-slate-600 p-0.5">
                                    <X size={14} />
                                </button>
                            </div>

                            {bomOptions.length === 0 ? (
                                <div className="text-center py-5 text-sm text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                                    No approved BOMs available for this product
                                </div>
                            ) : (
                                <>
                                    <div className="space-y-1.5 max-h-52 overflow-y-auto pr-0.5">
                                        {bomOptions.map(bom => (
                                            <label key={bom.id}
                                                className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all
                                                    ${pickedBomId === String(bom.id)
                                                        ? 'border-violet-400 bg-violet-50 shadow-sm'
                                                        : 'border-slate-200 bg-white hover:border-violet-200 hover:bg-violet-50/30'}`}
                                            >
                                                <input
                                                    type="radio"
                                                    name={`bom-pick-${sop.id}`}
                                                    value={bom.id}
                                                    checked={pickedBomId === String(bom.id)}
                                                    onChange={() => setPickedBomId(String(bom.id))}
                                                    className="mt-0.5 accent-violet-600 shrink-0"
                                                />
                                                <div className="flex-1 min-w-0">
                                                    <p className="font-bold text-slate-800 text-sm">{bom.bom_name}</p>
                                                    {(bom.ratio_groups || []).length > 0 && (
                                                        <div className="flex flex-wrap gap-1 mt-1">
                                                            {bom.ratio_groups.map((rg, i) => (
                                                                <span key={i}
                                                                    className="text-[9px] bg-violet-50 text-violet-600 border border-violet-100 px-1.5 py-0.5 rounded font-bold">
                                                                    {rg.ratio_group_name}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    )}
                                                    {(bom.fabric_consumptions?.length > 0 || bom.material_consumptions?.length > 0) && (
                                                        <p className="text-[10px] text-slate-400 mt-0.5">
                                                            {[
                                                                bom.fabric_consumptions?.length > 0   && `${bom.fabric_consumptions.length} fabric`,
                                                                bom.material_consumptions?.length > 0 && `${bom.material_consumptions.length} material`,
                                                            ].filter(Boolean).join(' · ')}
                                                        </p>
                                                    )}
                                                </div>
                                            </label>
                                        ))}
                                    </div>
                                    <div className="flex justify-end mt-3">
                                        <button
                                            onClick={confirmLink}
                                            disabled={!pickedBomId}
                                            className="flex items-center gap-1.5 text-sm font-bold text-white bg-violet-600 hover:bg-violet-700 disabled:opacity-40 px-4 py-2 rounded-xl transition-colors"
                                        >
                                            <Link2 size={14} /> Confirm Link
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    )
                )}
            </div>
        </div>
    );
};

// ─── FABRIC REQUIREMENTS TABLE ─────────────────────────────────────────────────

const FabricTable = ({ rows }) => {
    if (!rows?.length) return <p className="text-sm text-slate-400 italic">No fabric requirements.</p>;
    return (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-sm">
                <thead>
                    <tr className="bg-slate-50 text-slate-500 text-[10px] uppercase tracking-wider">
                        {['Fabric Type', 'Color', 'Required (m)', 'In Stock (m)', 'Rolls', 'Status'].map(h => (
                            <th key={h} className={`px-4 py-2.5 font-bold ${h === 'Fabric Type' || h === 'Color' ? 'text-left' : 'text-right'}`}>{h}</th>
                        ))}
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                    {rows.map((r, i) => (
                        <tr key={i} className={r.meters_shortfall > 0 ? 'bg-red-50/40' : ''}>
                            <td className="px-4 py-2.5 font-semibold text-slate-700">{r.fabric_type_name}</td>
                            <td className="px-4 py-2.5 text-slate-600">{r.color_name}</td>
                            <td className="px-4 py-2.5 text-right font-medium text-slate-700">{fmt(r.meters_required)} m</td>
                            <td className="px-4 py-2.5 text-right text-slate-500">{fmt(r.meters_in_stock)} m</td>
                            <td className="px-4 py-2.5 text-right text-slate-500">{r.roll_count ?? 0}</td>
                            <td className="px-4 py-2.5 text-right">
                                {r.meters_shortfall > 0
                                    ? <span className="text-red-600 font-bold">-{fmt(r.meters_shortfall)} m short</span>
                                    : <span className="text-emerald-600 font-medium">✓ OK</span>}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

// ─── TRIM REQUIREMENTS ────────────────────────────────────────────────────────

const MatchBadge = ({ type }) => {
    const cfg = {
        exact:   'bg-emerald-50 text-emerald-700 border-emerald-200',
        missing: 'bg-red-50 text-red-600 border-red-200',
    }[type] || 'bg-amber-50 text-amber-600 border-amber-200';
    return <span className={`text-[9px] px-1.5 py-0.5 rounded border font-bold uppercase ${cfg}`}>{type}</span>;
};

const ColorAgnosticDetail = ({ trim }) => (
    <div className="flex flex-wrap items-center gap-6 text-sm">
        {[
            { label: 'Required',  val: fmt(trim.total_quantity_required), cls: 'text-slate-700' },
            { label: 'In Stock',  val: fmt(trim.in_stock),                cls: (trim.shortfall || 0) > 0 ? 'text-red-600' : 'text-emerald-600' },
            ...(trim.shortfall > 0 ? [{ label: 'Shortfall', val: `-${fmt(trim.shortfall)}`, cls: 'text-red-600' }] : []),
        ].map(({ label, val, cls }) => (
            <div key={label}>
                <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-0.5">{label}</p>
                <p className={`font-bold ${cls}`}>{val}</p>
            </div>
        ))}
        {(trim.substitutes || []).length > 0 && (
            <div>
                <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">Substitutes</p>
                <div className="flex flex-wrap gap-1">
                    {trim.substitutes.map(s => (
                        <span key={s.substitute_variant_id}
                            className="text-[10px] bg-amber-50 text-amber-700 border border-amber-100 px-1.5 py-0.5 rounded">
                            {s.item_name} (stock: {s.in_stock})
                        </span>
                    ))}
                </div>
            </div>
        )}
    </div>
);

const ColorMatchedDetail = ({ colorRequirements }) => (
    <div className="space-y-2">
        {(colorRequirements || []).map((cr, i) => (
            <div key={i} className={`flex flex-wrap items-center gap-5 text-sm p-3 rounded-lg ${cr.shortfall > 0 ? 'bg-red-50' : 'bg-slate-50'}`}>
                <div className="w-28 shrink-0">
                    <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-0.5">Color</p>
                    <p className="font-semibold text-slate-700 text-xs">{cr.color_name}</p>
                </div>
                <div className="w-20 shrink-0">
                    <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-0.5">Required</p>
                    <p className="font-bold text-slate-700">{fmt(cr.quantity_required)}</p>
                </div>
                <div className="w-20 shrink-0">
                    <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-0.5">In Stock</p>
                    <p className={`font-bold ${cr.shortfall > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{fmt(cr.in_stock)}</p>
                </div>
                <div className="shrink-0">
                    <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-0.5">Match</p>
                    <MatchBadge type={cr.match_type} />
                </div>
                {cr.shortfall > 0 && (
                    <div className="shrink-0">
                        <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-0.5">Shortfall</p>
                        <p className="font-bold text-red-600">-{fmt(cr.shortfall)}</p>
                    </div>
                )}
                {(cr.substitutes || []).length > 0 && (
                    <div className="flex-1 min-w-0">
                        <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">Substitutes</p>
                        <div className="flex flex-wrap gap-1">
                            {cr.substitutes.map(s => (
                                <span key={s.substitute_variant_id}
                                    className="text-[10px] bg-amber-50 text-amber-700 border border-amber-100 px-1.5 py-0.5 rounded">
                                    {s.item_name} · {s.color_name} (stock: {s.in_stock})
                                </span>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        ))}
    </div>
);

const TrimRequirements = ({ rows }) => {
    const [expanded, setExpanded] = useState(new Set());
    if (!rows?.length) return <p className="text-sm text-slate-400 italic">No trim requirements.</p>;

    const toggle = (id) => setExpanded(prev => {
        const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s;
    });

    return (
        <div className="space-y-2">
            {rows.map(trim => {
                const isOpen = expanded.has(trim.trim_item_id);
                const hasShortfall = trim.is_color_agnostic
                    ? (trim.shortfall || 0) > 0
                    : (trim.color_requirements || []).some(cr => cr.shortfall > 0);

                return (
                    <div key={trim.trim_item_id}
                        className={`border rounded-xl overflow-hidden ${hasShortfall ? 'border-red-200' : 'border-slate-200'}`}>
                        <button
                            onClick={() => toggle(trim.trim_item_id)}
                            className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
                        >
                            <div className="flex items-center gap-2.5 flex-wrap">
                                <span className="font-semibold text-slate-800 text-sm">{trim.trim_item_name}</span>
                                {trim.is_color_agnostic
                                    ? <span className="text-[9px] bg-slate-100 text-slate-500 border border-slate-200 px-1.5 py-0.5 rounded font-bold uppercase">Agnostic</span>
                                    : <span className="text-[9px] bg-indigo-50 text-indigo-600 border border-indigo-100 px-1.5 py-0.5 rounded font-bold uppercase">Color Matched</span>}
                                {hasShortfall && (
                                    <span className="text-[9px] bg-red-50 text-red-600 border border-red-100 px-1.5 py-0.5 rounded font-bold uppercase flex items-center gap-0.5">
                                        <AlertTriangle size={8} /> Shortfall
                                    </span>
                                )}
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                                {trim.is_color_agnostic && (
                                    <span className="text-xs text-slate-500">{fmt(trim.total_quantity_required)} total</span>
                                )}
                                {isOpen ? <ChevronDown size={15} className="text-slate-400" /> : <ChevronRight size={15} className="text-slate-400" />}
                            </div>
                        </button>
                        {isOpen && (
                            <div className="px-4 py-3 border-t border-slate-100">
                                {trim.is_color_agnostic
                                    ? <ColorAgnosticDetail trim={trim} />
                                    : <ColorMatchedDetail colorRequirements={trim.color_requirements} />}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
};

// ─── STAT CARD ─────────────────────────────────────────────────────────────────

const StatCard = ({ label, value, ok }) => (
    <div className={`rounded-xl p-4 border ${ok ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">{label}</p>
        <p className={`text-2xl font-extrabold ${ok ? 'text-emerald-700' : 'text-red-600'}`}>{value}</p>
    </div>
);

// ─── SECTION WRAPPER ───────────────────────────────────────────────────────────

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

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────

const ProductionPlanningPage = () => {
    const [formData,       setFormData]       = useState(null);
    const [loadingForm,    setLoadingForm]     = useState(true);
    const [formErr,        setFormErr]         = useState(null);

    const [selectedOrderId, setSelectedOrderId] = useState(null);
    const [orderDetail,    setOrderDetail]     = useState(null);
    const [loadingOrder,   setLoadingOrder]    = useState(false);

    const [requirements,   setRequirements]   = useState(null);
    const [loadingReqs,    setLoadingReqs]     = useState(false);
    const [reqsErr,        setReqsErr]         = useState(null);

    const [linking,        setLinking]         = useState({});
    const [searchQ,        setSearchQ]         = useState('');

    // Load sales orders + approved BOMs on mount
    useEffect(() => {
        planningApi.getFormData()
            .then(res => setFormData(res.data?.data ?? res.data))
            .catch(e  => setFormErr(e?.response?.data?.error || 'Failed to load planning data'))
            .finally(() => setLoadingForm(false));
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
        setRequirements(null);
        setReqsErr(null);
        setOrderDetail(null);
        setLoadingOrder(true);
        planningApi.getOrderDetail(orderId)
            .then(res => setOrderDetail(res.data?.data ?? res.data))
            .catch(e  => console.error('Order detail fetch failed', e))
            .finally(() => setLoadingOrder(false));
    }, [selectedOrderId]);

    const handleLink = useCallback(async (sopId, bomId) => {
        setLinking(l => ({ ...l, [sopId]: true }));
        try {
            await planningApi.linkBom(sopId, bomId);
            await refreshOrder(selectedOrderId);
            setRequirements(null);
        } catch (e) {
            console.error('Link BOM failed', e);
        } finally {
            setLinking(l => ({ ...l, [sopId]: false }));
        }
    }, [selectedOrderId, refreshOrder]);

    const handleUnlink = useCallback(async (sopId) => {
        setLinking(l => ({ ...l, [sopId]: true }));
        try {
            await planningApi.unlinkBom(sopId);
            await refreshOrder(selectedOrderId);
            setRequirements(null);
        } catch (e) {
            console.error('Unlink BOM failed', e);
        } finally {
            setLinking(l => ({ ...l, [sopId]: false }));
        }
    }, [selectedOrderId, refreshOrder]);

    const calculateRequirements = useCallback(async () => {
        setLoadingReqs(true);
        setReqsErr(null);
        try {
            const res = await planningApi.getRequirements(selectedOrderId);
            setRequirements(res.data?.data ?? res.data);
        } catch (e) {
            setReqsErr(e?.response?.data?.error || 'Failed to calculate requirements');
        } finally {
            setLoadingReqs(false);
        }
    }, [selectedOrderId]);

    const orders         = formData?.sales_orders    || [];
    const bomsByProduct  = formData?.boms_by_product || {};
    const sops           = orderDetail?.products     || [];
    const unlinkedCount  = sops.filter(s => !s.bom_linked && !s.bom_id).length;

    const filteredOrders = orders.filter(o =>
        !searchQ ||
        o.order_number?.toLowerCase().includes(searchQ.toLowerCase()) ||
        (o.customer_name || o.buyer_name || '').toLowerCase().includes(searchQ.toLowerCase())
    );

    const fabricShortfalls = (requirements?.fabric_requirements || []).filter(r => r.meters_shortfall > 0).length;
    const trimShortfalls   = (requirements?.trim_requirements   || []).filter(t =>
        t.is_color_agnostic ? (t.shortfall || 0) > 0 : (t.color_requirements || []).some(cr => cr.shortfall > 0)
    ).length;

    return (
        <div className="flex h-full bg-slate-50 overflow-hidden">

            {/* ── LEFT: Order sidebar ── */}
            <div className="w-72 min-w-[18rem] bg-white border-r border-slate-200 flex flex-col overflow-hidden">
                <div className="px-4 py-4 border-b border-slate-100 shrink-0">
                    <h2 className="font-extrabold text-slate-800 text-sm mb-3">Sales Orders</h2>
                    <input
                        type="search"
                        placeholder="Search order or buyer…"
                        value={searchQ}
                        onChange={e => setSearchQ(e.target.value)}
                        className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-violet-400"
                    />
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
            </div>

            {/* ── RIGHT: Detail panel ── */}
            <div className="flex-1 overflow-y-auto">
                {!selectedOrderId && (
                    <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-3">
                        <ShoppingBag size={52} className="opacity-20" />
                        <p className="text-sm font-medium">Select a sales order to start planning</p>
                    </div>
                )}

                {selectedOrderId && (
                    <div className="p-6 space-y-5">
                        {loadingOrder && <Spinner />}

                        {!loadingOrder && orderDetail && (
                            <>
                                {/* ── Order header ── */}
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

                                {/* ── BOM Linking ── */}
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
                                            <SopCard
                                                key={sop.id}
                                                sop={sop}
                                                bomOptions={bomsByProduct[String(sop.product_id)] || bomsByProduct[sop.product_id] || []}
                                                onLink={handleLink}
                                                onUnlink={handleUnlink}
                                                isLinking={!!linking[sop.id]}
                                            />
                                        ))}
                                    </div>
                                </Section>

                                {/* ── Calculate action ── */}
                                <div className="flex items-center gap-4">
                                    <button
                                        onClick={calculateRequirements}
                                        disabled={loadingReqs || unlinkedCount > 0}
                                        className="flex items-center gap-2 text-sm font-bold text-white bg-violet-600 hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed px-5 py-2.5 rounded-xl transition-colors shadow-sm"
                                    >
                                        {loadingReqs ? <Loader2 size={16} className="animate-spin" /> : <Calculator size={16} />}
                                        Calculate Requirements
                                    </button>
                                    {unlinkedCount > 0 && (
                                        <p className="text-xs text-slate-400">Link all BOMs first to enable calculation.</p>
                                    )}
                                    {requirements && !loadingReqs && (
                                        <button
                                            onClick={calculateRequirements}
                                            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 bg-white border border-slate-200 hover:border-slate-300 px-3 py-2 rounded-lg transition-colors"
                                        >
                                            <RefreshCw size={13} /> Recalculate
                                        </button>
                                    )}
                                </div>

                                {reqsErr && (
                                    <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600">
                                        <AlertCircle size={15} className="shrink-0" /> {reqsErr}
                                    </div>
                                )}

                                {/* ── Requirements ── */}
                                {requirements && (
                                    <>
                                        {(requirements.unlinked_products || []).length > 0 && (
                                            <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700">
                                                <AlertTriangle size={15} className="shrink-0" />
                                                Products excluded (no BOM): {requirements.unlinked_products.map(p => p.product_name).join(', ')}
                                            </div>
                                        )}

                                        {/* Summary */}
                                        <div className="grid grid-cols-3 gap-3">
                                            <StatCard
                                                label="Fabric types needed"
                                                value={requirements.fabric_requirements?.length || 0}
                                                ok={true}
                                            />
                                            <StatCard
                                                label="Fabric shortfalls"
                                                value={fabricShortfalls}
                                                ok={fabricShortfalls === 0}
                                            />
                                            <StatCard
                                                label="Trim shortfalls"
                                                value={trimShortfalls}
                                                ok={trimShortfalls === 0}
                                            />
                                        </div>

                                        {/* Fabric table */}
                                        <Section icon={Layers} iconCls="text-indigo-500" title="Fabric Requirements">
                                            <FabricTable rows={requirements.fabric_requirements} />
                                        </Section>

                                        {/* Trim table */}
                                        <Section icon={Package} iconCls="text-emerald-500" title="Trim & Material Requirements">
                                            <TrimRequirements rows={requirements.trim_requirements} />
                                        </Section>
                                    </>
                                )}
                            </>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default ProductionPlanningPage;

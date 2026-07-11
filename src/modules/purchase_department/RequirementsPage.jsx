import { useState, useEffect, useCallback, useMemo } from 'react';
import {
    Loader2, Filter, CheckSquare, Square, ShoppingCart,
    AlertTriangle, ChevronDown, ChevronUp, X, Search,
    Package, Scissors, Tag, Layers, List, Maximize2, Minimize2, Ban,
    Wrench, FileText,
} from 'lucide-react';
import { purchaseDeptApi } from '../../api/purchaseDeptApi';
import api from '../../utils/api';
import PoDetailModal from './PoDetailModal';
import SearchableSelect from '../../shared/SearchableSelect';

const URGENCY_CFG = {
    urgent: { cls: 'bg-red-100 text-red-700 border-red-200',         dot: 'bg-red-500',     label: 'Urgent' },
    high:   { cls: 'bg-orange-100 text-orange-700 border-orange-200', dot: 'bg-orange-500', label: 'High'   },
    normal: { cls: 'bg-blue-100 text-blue-700 border-blue-200',       dot: 'bg-blue-400',   label: 'Normal' },
    low:    { cls: 'bg-slate-100 text-slate-600 border-slate-200',    dot: 'bg-slate-400',  label: 'Low'    },
};

const URGENCY_RANK = { urgent: 0, high: 1, normal: 2, low: 3 };
const URGENCY_ORDER_LIST = ['urgent', 'high', 'normal', 'low'];

const STATUS_CFG = {
    PENDING:   { cls: 'bg-amber-100 text-amber-700 border-amber-200',         label: 'Pending'    },
    PO_RAISED: { cls: 'bg-blue-100 text-blue-700 border-blue-200',             label: 'PO Raised'  },
    FULFILLED: { cls: 'bg-emerald-100 text-emerald-700 border-emerald-200',    label: 'Fulfilled'  },
    CANCELLED: { cls: 'bg-slate-100 text-slate-500 border-slate-200',          label: 'Cancelled'  },
};

// Top tab strip — keys map to statusFilter; `''` means "All active" (PENDING + PO_RAISED mix).
const STATUS_TABS = [
    { key: 'PENDING',   label: 'New',       chip: 'bg-amber-100 text-amber-700'     },
    { key: 'PO_RAISED', label: 'On Order',  chip: 'bg-blue-100 text-blue-700'        },
    { key: 'FULFILLED', label: 'Fulfilled', chip: 'bg-emerald-100 text-emerald-700'  },
    { key: 'CANCELLED', label: 'Cancelled', chip: 'bg-red-100 text-red-700'          },
    { key: '',          label: 'All',       chip: 'bg-slate-100 text-slate-700'      },
];

const TYPE_CFG = {
    fabric: { icon: Package,   cls: 'bg-violet-100 text-violet-700', label: 'Fabric' },
    trim:   { icon: Scissors,  cls: 'bg-amber-100 text-amber-700',   label: 'Trim'   },
    spare:  { icon: Wrench,    cls: 'bg-blue-100 text-blue-700',     label: 'Spare'  },
    other:  { icon: FileText,  cls: 'bg-slate-100 text-slate-600',   label: 'Other'  },
};

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en', { dateStyle: 'medium' }) : '—';
const fmt = (n, dec = 1) => Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: dec });

const bucketStats = (rows) => {
    let totalQty = 0, totalMeters = 0;
    let pendingQty = 0, pendingMeters = 0, pendingCount = 0;
    let onOrderQty = 0, onOrderMeters = 0, onOrderCount = 0;
    let fulfilledQty = 0, fulfilledMeters = 0, fulfilledCount = 0;
    const soSet = new Set();
    const customerSet = new Set();
    const poSet = new Set();
    const urgencies = new Set();
    let substituteCount = 0;
    let earliestDate = null;
    rows.forEach(r => {
        const q = Number(r.quantity_required ?? 0);
        const m = Number(r.meters_required ?? 0);
        totalQty   += q;
        totalMeters += m;
        if (r.status === 'PENDING')   { pendingQty   += q; pendingMeters   += m; pendingCount++;   }
        if (r.status === 'PO_RAISED') { onOrderQty   += q; onOrderMeters   += m; onOrderCount++;   if (r.po_code) poSet.add(r.po_code); }
        if (r.status === 'FULFILLED') { fulfilledQty += q; fulfilledMeters += m; fulfilledCount++; }
        if (r.order_number)  soSet.add(r.order_number);
        if (r.customer_name) customerSet.add(r.customer_name);
        urgencies.add((r.urgency || 'normal').toLowerCase());
        if (r.is_substitute) substituteCount++;
        const dueDate = r.expected_delivery_date || r.created_at;
        if (dueDate && (!earliestDate || new Date(dueDate) < new Date(earliestDate))) {
            earliestDate = dueDate;
        }
    });
    const urgency = URGENCY_ORDER_LIST.find(u => urgencies.has(u)) || 'normal';
    return {
        totalQty, totalMeters,
        pendingQty, pendingMeters, pendingCount,
        onOrderQty, onOrderMeters, onOrderCount,
        fulfilledQty, fulfilledMeters, fulfilledCount,
        soCount: soSet.size,
        customerCount: customerSet.size,
        poCount: poSet.size,
        rowCount: rows.length,
        substituteCount,
        urgency,
        earliestDate,
    };
};

const reqTitle = (req) => {
    if (req.type === 'fabric') {
        const colorBit = req.fabric_color_name
            ? `${req.fabric_color_name}${req.fabric_color_number ? ` · ${req.fabric_color_number}` : ''}`
            : null;
        const parts = [req.fabric_type_name, colorBit].filter(Boolean);
        return parts.length ? parts.join(' · ') : 'Fabric requirement';
    }
    if (req.type === 'trim') {
        const base = req.trim_item_name || 'Trim requirement';
        return req.variant_size ? `${base} · Sz ${req.variant_size}` : base;
    }
    if (req.type === 'spare') {
        return req.spare_part_name
            ? `${req.spare_part_name}${req.spare_part_number ? ` (${req.spare_part_number})` : ''}`
            : 'Spare part requirement';
    }
    if (req.type === 'other') {
        return req.description || 'Other requirement';
    }
    return 'Requirement';
};

// ─── LEAF ROW (used inside a bucket's expanded body) ─────────────────────────

const LeafRow = ({ req, isFabric, isSelected, onToggle, onOpenPo, openingPo, onReject }) => {
    const statusCfg = STATUS_CFG[req.status] || { cls: 'bg-slate-100 text-slate-500 border-slate-200', label: req.status || 'PENDING' };
    return (
        <div className={`flex items-center gap-2 px-2 py-1.5 rounded-lg ${isSelected ? 'bg-orange-50/60' : 'hover:bg-slate-50'}`}>
            <button onClick={() => onToggle(req.id)} className="shrink-0">
                {isSelected
                    ? <CheckSquare size={13} className="text-orange-500" />
                    : <Square      size={13} className="text-slate-300" />}
            </button>
            <div className="flex-1 min-w-0 flex items-center gap-1.5 flex-wrap">
                {req.is_free_form ? (
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded">
                        Custom PO
                    </span>
                ) : req.is_standalone ? (
                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
                        Standalone
                    </span>
                ) : (
                    <span className="text-[11px] font-mono text-slate-600">{req.order_number || '—'}</span>
                )}
                {req.customer_name && (
                    <span className="text-[11px] text-slate-500 truncate">· {req.customer_name}</span>
                )}
                {req.product_name && (
                    <span className="text-[11px] text-slate-400 truncate">· {req.product_name}</span>
                )}
                {req.is_substitute && req.type === 'trim' && (
                    <span title={`Planned ${req.fabric_color_name || '—'}${req.fabric_color_number ? ` · ${req.fabric_color_number}` : ''} → buying ${req.variant_color_name || '—'}${req.variant_color_number ? ` · ${req.variant_color_number}` : ''}`}
                          className="text-[8px] font-bold uppercase tracking-wider px-1 py-0.5 rounded bg-amber-100 text-amber-700">
                        🔄
                    </span>
                )}
                {req.po_code && (
                    <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onOpenPo && onOpenPo(req); }}
                        disabled={openingPo}
                        title={`Open ${req.po_code}`}
                        className="text-[9px] font-mono text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-1.5 py-0.5 rounded transition-colors disabled:opacity-50"
                    >
                        {openingPo ? <Loader2 size={9} className="inline animate-spin mr-0.5" /> : null}
                        {req.po_code}
                    </button>
                )}
                {req.created_at && (
                    <span className="text-[10px] text-slate-400">· {fmtDate(req.created_at)}</span>
                )}
            </div>
            <div className="shrink-0 text-[11px] font-semibold text-slate-700">
                {isFabric
                    ? `${fmt(req.meters_required)} m`
                    : `${fmt(req.quantity_required, 0)} ${req.unit_of_measure || req.trim_uom || 'pcs'}`}
            </div>
            <div className={`shrink-0 text-[9px] uppercase font-bold px-1.5 py-0.5 rounded-full border ${statusCfg.cls}`}>
                {statusCfg.label}
            </div>
            {onReject && req.status === 'PENDING' && (
                <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onReject(req); }}
                    title="Reject — cannot fulfill"
                    className="shrink-0 p-1 rounded-md text-slate-300 hover:text-red-600 hover:bg-red-50 transition-colors"
                >
                    <Ban size={12} />
                </button>
            )}
        </div>
    );
};

// ─── CREATE PO MODAL ─────────────────────────────────────────────────────────

const CreatePoModal = ({ requirements, onClose, onCreated }) => {
    const [supplierId,       setSupplierID]       = useState('');
    const [deliveryDate,     setDeliveryDate]     = useState('');
    const [unitPrices,       setUnitPrices]       = useState({});
    const [quantities,       setQuantities]       = useState({}); // per-group overrides; empty means use default
    const [suppliers,        setSuppliers]        = useState([]);
    const [busy,             setBusy]             = useState(false);
    const [err,              setErr]              = useState(null);

    useEffect(() => {
        api.get('/shared/supplier')
            .then(r => {
                setSuppliers(r.data?.data ?? r.data ?? []);
            })
            .catch(() => {});
    }, []);

    const groups = useMemo(() => {
        const map = new Map();
        requirements.forEach(req => {
            const key =
                req.type === 'fabric'
                    ? `fabric:${req.fabric_type_id ?? 't?'}:${req.fabric_color_id ?? 'c?'}`
                    : req.type === 'trim'
                        ? `trim:${req.trim_item_variant_id ?? `req-${req.id}`}`
                        : req.type === 'spare'
                            ? `spare:${req.spare_part_id ?? `req-${req.id}`}`
                            : `other:${req.description ?? req.id}`;
            if (!map.has(key)) {
                let label;
                if (req.type === 'fabric') {
                    label = `${req.fabric_type_name || 'Fabric'}${req.fabric_color_name ? ` · ${req.fabric_color_name}` : ''}${req.fabric_color_number ? ` (${req.fabric_color_number})` : ''}`;
                } else if (req.type === 'trim') {
                    label = `${req.trim_item_name || 'Trim'}${req.variant_color_name ? ` · ${req.variant_color_name}` : ''}${req.variant_color_number ? ` · ${req.variant_color_number}` : ''}${req.variant_size ? ` · Sz ${req.variant_size}` : ''}${req.is_substitute ? ' (sub)' : ''}`;
                } else if (req.type === 'spare') {
                    label = req.spare_part_name
                        ? `${req.spare_part_name}${req.spare_part_number ? ` (${req.spare_part_number})` : ''}`
                        : 'Spare Part';
                } else {
                    label = req.description || 'Other';
                }
                map.set(key, {
                    key,
                    type: req.type,
                    label,
                    items: [],
                    totalMeters: 0,
                    totalQty: 0,
                    unitOfMeasure: req.unit_of_measure || req.trim_uom,
                    fabric_type_id:       req.fabric_type_id ?? null,
                    fabric_color_id:      req.fabric_color_id ?? null,
                    trim_item_variant_id: req.trim_item_variant_id ?? null,
                    spare_part_id:        req.spare_part_id ?? null,
                    description:          req.description ?? null,
                });
            }
            const g = map.get(key);
            g.items.push(req);
            g.totalMeters += parseFloat(req.meters_required ?? 0);
            g.totalQty    += parseFloat(req.quantity_required ?? 0);
        });
        return [...map.values()];
    }, [requirements]);

    // Pre-fill each group's qty field with its needed total so the buyer just
    // edits a starting value rather than guessing. Existing user edits are kept.
    useEffect(() => {
        setQuantities(prev => {
            const next = { ...prev };
            let changed = false;
            groups.forEach(g => {
                if (next[g.key] === undefined) {
                    const def = g.type === 'fabric' ? g.totalMeters : g.totalQty;
                    next[g.key] = def ? String(def) : '';
                    changed = true;
                }
            });
            return changed ? next : prev;
        });
    }, [groups]);

    const handleSubmit = async () => {
        if (!supplierId)    { setErr('Please select a supplier'); return; }
        if (!deliveryDate)  { setErr('Please set an expected delivery date'); return; }

        const hasStandalone = requirements.some(r => r.is_standalone);
        const hasSoLinked   = requirements.some(r => !r.is_standalone && !r.is_free_form);
        if (hasStandalone && hasSoLinked) {
            setErr('Cannot mix standalone and sales-order requirements in one PO. Create separate POs.');
            return;
        }

        setBusy(true); setErr(null);
        try {
            const items = groups.map(g => {
                const unit_price      = parseFloat(unitPrices[g.key] ?? 0) || 0;
                const requirement_ids = g.items.map(i => i.id);
                const defaultQty      = g.type === 'fabric' ? g.totalMeters : g.totalQty;
                const overrideQty     = parseFloat(quantities[g.key]);
                const quantity        = (Number.isFinite(overrideQty) && overrideQty > 0) ? overrideQty : defaultQty;
                if (g.type === 'fabric') {
                    return {
                        type:            'fabric',
                        fabric_type_id:  g.fabric_type_id,
                        fabric_color_id: g.fabric_color_id,
                        quantity,
                        uom:             'meter',
                        unit_price,
                        requirement_ids,
                    };
                }
                if (g.type === 'trim') {
                    return {
                        type:                 'trim',
                        trim_item_variant_id: g.trim_item_variant_id,
                        quantity,
                        uom:                  g.unitOfMeasure || 'pcs',
                        unit_price,
                        requirement_ids,
                    };
                }
                if (g.type === 'spare') {
                    return {
                        type:          'spare',
                        spare_part_id: g.spare_part_id,
                        quantity,
                        uom:           g.unitOfMeasure || 'pcs',
                        unit_price,
                        requirement_ids,
                    };
                }
                return {
                    type:        'other',
                    description: g.description,
                    quantity,
                    uom:         g.unitOfMeasure || 'pcs',
                    unit_price,
                    requirement_ids,
                };
            });

            const payload = {
                supplier_id:            supplierId ? parseInt(supplierId) : null,
                expected_delivery_date: deliveryDate || null,
                items,
            };
            // Standalone requirements produce a CUSTOM-PO — no sales_order_id needed.

            await purchaseDeptApi.createOrder(payload);
            onCreated();
        } catch (e) {
            setErr(e?.response?.data?.error || 'Failed to create purchase order');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                    <h2 className="text-base font-bold text-slate-800">Create Purchase Order</h2>
                    <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400">
                        <X size={18} />
                    </button>
                </div>

                <div className="overflow-y-auto flex-1 px-6 py-4 space-y-5">
                    {/* Requirements summary, grouped by item */}
                    <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                            Bundling {requirements.length} Requirement{requirements.length !== 1 ? 's' : ''} · {groups.length} Item{groups.length !== 1 ? 's' : ''}
                        </p>
                        <div className="space-y-2">
                            {groups.map(g => {
                                const typeCfg = TYPE_CFG[g.type] || TYPE_CFG.other;
                                const TypeIcon = typeCfg.icon;
                                const isFabric = g.type === 'fabric';
                                return (
                                    <div key={g.key} className="bg-slate-50 rounded-xl p-3 space-y-2">
                                        <div className="flex items-center gap-3 flex-wrap">
                                            <div className={`p-1.5 rounded-lg ${typeCfg.cls}`}>
                                                <TypeIcon size={13} />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-xs font-semibold text-slate-800 truncate">{g.label}</p>
                                                <p className="text-[10px] text-slate-500">
                                                    {isFabric
                                                        ? `${fmt(g.totalMeters)} m needed`
                                                        : `${fmt(g.totalQty, 0)} ${g.unitOfMeasure || 'pcs'} needed`}
                                                    {' · '}{g.items.length} requirement{g.items.length !== 1 ? 's' : ''}
                                                </p>
                                            </div>
                                            <div className="shrink-0">
                                                {(() => {
                                                    const defaultQty = isFabric ? g.totalMeters : g.totalQty;
                                                    const value      = quantities[g.key] ?? '';
                                                    const numeric    = parseFloat(value);
                                                    const isOver     = Number.isFinite(numeric) && numeric > defaultQty;
                                                    return (
                                                        <div className="flex flex-col items-end">
                                                            <input
                                                                type="number"
                                                                min="0"
                                                                step="any"
                                                                placeholder={fmt(defaultQty, isFabric ? 1 : 0)}
                                                                value={value}
                                                                onChange={e => setQuantities(p => ({ ...p, [g.key]: e.target.value }))}
                                                                title={`Default: ${fmt(defaultQty, isFabric ? 1 : 0)} ${isFabric ? 'm' : (g.unitOfMeasure || 'pcs')}. Increase to keep stock buffer.`}
                                                                className={`w-28 text-xs border rounded-lg px-2.5 py-1.5 focus:outline-none text-right ${isOver ? 'border-emerald-300 focus:border-emerald-400 bg-emerald-50' : 'border-slate-200 focus:border-orange-400'}`}
                                                            />
                                                            <span className={`text-[9px] mt-0.5 ${isOver ? 'text-emerald-600 font-bold' : 'text-slate-400'}`}>
                                                                {isOver
                                                                    ? `+${fmt(numeric - defaultQty, isFabric ? 1 : 0)} extra ${isFabric ? 'm' : (g.unitOfMeasure || 'pcs')}`
                                                                    : `qty to order (${isFabric ? 'm' : (g.unitOfMeasure || 'pcs')})`}
                                                            </span>
                                                        </div>
                                                    );
                                                })()}
                                            </div>
                                            <div className="shrink-0">
                                                <input
                                                    type="number"
                                                    min="0"
                                                    step="any"
                                                    placeholder={isFabric ? 'Price / m' : `Price / ${g.unitOfMeasure || 'pc'}`}
                                                    value={unitPrices[g.key] || ''}
                                                    onChange={e => setUnitPrices(p => ({ ...p, [g.key]: e.target.value }))}
                                                    className="w-28 text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-orange-400 text-right"
                                                />
                                            </div>
                                        </div>
                                        {g.items.length > 1 && (
                                            <div className="pl-9 space-y-1">
                                                {g.items.map(item => {
                                                    const sub = isFabric
                                                        ? (item.fabric_color_name
                                                            ? `${item.fabric_color_name}${item.fabric_color_number ? ` · ${item.fabric_color_number}` : ''}`
                                                            : 'No color')
                                                        : (item.variant_color_name
                                                            ? `${item.variant_color_name}${item.variant_color_number ? ` · ${item.variant_color_number}` : ''}${item.variant_size ? ` · Sz ${item.variant_size}` : ''}${item.is_substitute ? ' · sub' : ''}`
                                                            : (item.trim_item_code || 'No variant'));
                                                    return (
                                                        <div key={item.id} className="flex items-center justify-between text-[10px] text-slate-500">
                                                            <span className="truncate">
                                                                {sub}{item.order_number ? ` · ${item.order_number}` : ''}
                                                            </span>
                                                            <span className="shrink-0 ml-2 font-medium">
                                                                {isFabric
                                                                    ? `${fmt(item.meters_required)} m`
                                                                    : `${fmt(item.quantity_required, 0)} ${item.unit_of_measure || item.trim_uom || 'pcs'}`}
                                                            </span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Supplier */}
                    <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Supplier *</label>
                        <SearchableSelect
                            value={supplierId}
                            onChange={v => setSupplierID(v)}
                            options={suppliers.map(s => ({ value: s.id, label: s.name || s.username || `Supplier #${s.id}` }))}
                            placeholder="— Select supplier —"
                            className="w-full"
                        />
                    </div>

                    {/* Expected delivery date */}
                    <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Expected Delivery Date *</label>
                        <input
                            type="date"
                            value={deliveryDate}
                            onChange={e => setDeliveryDate(e.target.value)}
                            className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:border-orange-400"
                        />
                    </div>

                    {err && (
                        <div className="flex items-center gap-2 bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-sm text-red-600">
                            <AlertTriangle size={15} /> {err}
                        </div>
                    )}
                </div>

                <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100">
                    <button onClick={onClose} className="text-sm font-medium text-slate-500 hover:text-slate-700 px-4 py-2 rounded-xl hover:bg-slate-100 transition-colors">
                        Cancel
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={busy}
                        className="flex items-center gap-2 text-sm font-bold text-white bg-orange-500 hover:bg-orange-600 disabled:opacity-40 px-5 py-2 rounded-xl transition-colors"
                    >
                        {busy && <Loader2 size={14} className="animate-spin" />}
                        Create Purchase Order
                    </button>
                </div>
            </div>
        </div>
    );
};

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────

const RequirementsPage = () => {
    const [requirements, setRequirements]   = useState([]);
    const [loading,      setLoading]        = useState(true);
    const [typeFilter,   setTypeFilter]     = useState('');
    const [statusFilter, setStatusFilter]   = useState('PENDING');
    const [search,       setSearch]         = useState('');
    const [selected,     setSelected]       = useState(new Set());
    const [showPOModal,  setShowPOModal]    = useState(false);
    const [expandedId,   setExpandedId]     = useState(null);
    const [viewMode,     setViewMode]       = useState('grouped'); // 'grouped' | 'flat'
    const [expandedKeys, setExpandedKeys]   = useState(new Set());
    const [viewingPo,    setViewingPo]      = useState(null);
    const [loadingPoCode, setLoadingPoCode] = useState(null);
    const [hideFullyOrdered, setHideFullyOrdered] = useState(true);
    const [statusCounts, setStatusCounts] = useState({ PENDING: 0, PO_RAISED: 0, FULFILLED: 0, CANCELLED: 0, '': 0 });

    // Lazy count-fetch — fires on mount and whenever the type filter changes.
    // Pulls all statuses in parallel + custom-PO summaries so the tab counts
    // reflect the active queue (including free-form POs aggregated into PO_RAISED).
    useEffect(() => {
        let cancelled = false;
        const baseParams = {};
        if (typeFilter) baseParams.type = typeFilter;
        const statusList = ['PENDING', 'PO_RAISED', 'FULFILLED', 'CANCELLED'];
        const reqPromises = statusList.map(s =>
            purchaseDeptApi.getRequirements({ ...baseParams, status: s })
                .then(r => (r.data?.data ?? r.data ?? []).length)
                .catch(() => 0)
        );
        const customPoPromise = Promise.all(['ISSUED', 'PARTIAL_RECEIPT'].map(s =>
            purchaseDeptApi.getOrders({ status: s })
                .then(r => r.data?.data ?? r.data ?? [])
                .catch(() => [])
        )).then(arrs => {
            const seen = new Set();
            return arrs.flat().filter(po => {
                if (!po || po.requirement_count !== 0) return false;
                if (seen.has(po.id)) return false;
                seen.add(po.id);
                return true;
            }).length;
        });
        Promise.all([...reqPromises, customPoPromise]).then(([p, po, f, c, freeForm]) => {
            if (cancelled) return;
            const counts = {
                PENDING:   p,
                PO_RAISED: po + freeForm,
                FULFILLED: f,
                CANCELLED: c,
            };
            counts[''] = counts.PENDING + counts.PO_RAISED;  // "All" = active queue (no history)
            setStatusCounts(counts);
        });
        return () => { cancelled = true; };
    }, [typeFilter, requirements.length]);

    const fetchRequirements = useCallback(async () => {
        setLoading(true);
        try {
            const baseParams = {};
            if (typeFilter) baseParams.type = typeFilter;

            // Status filter is now the source of truth for both views. Empty
            // string means the "All" tab — show the active queue (PENDING +
            // PO_RAISED side-by-side, never auto-dumping FULFILLED/CANCELLED).
            const statuses = statusFilter
                ? [statusFilter]
                : ['PENDING', 'PO_RAISED'];

            const reqsPromise = Promise.all(statuses.map(s => {
                const params = { ...baseParams };
                if (s) params.status = s;
                return purchaseDeptApi.getRequirements(params).then(r => r.data?.data ?? r.data ?? []);
            }));

            // Custom POs (no SO) produce no requirement rows of their own.
            // Synthesize them only when the active tab actually shows on-order
            // material (PO_RAISED or "All"). Skip on PENDING/FULFILLED/CANCELLED.
            const includeFreeForm = statusFilter === '' || statusFilter === 'PO_RAISED';
            const customPosPromise = includeFreeForm
                ? Promise.all(['ISSUED', 'PARTIAL_RECEIPT'].map(s =>
                    purchaseDeptApi.getOrders({ status: s })
                        .then(r => r.data?.data ?? r.data ?? [])
                        .catch(() => [])
                  )).then(arrs => {
                      const seen = new Set();
                      return arrs.flat().filter(po => {
                          if (!po || po.requirement_count !== 0) return false;
                          if (seen.has(po.id)) return false;
                          seen.add(po.id);
                          return true;
                      });
                  })
                : Promise.resolve([]);

            const [reqArrs, customPoSummaries] = await Promise.all([reqsPromise, customPosPromise]);

            // Now fetch full details for each custom PO so we can read items.
            const customPosFull = customPoSummaries.length > 0
                ? await Promise.all(customPoSummaries.map(po =>
                    purchaseDeptApi.getOrderById(po.id)
                        .then(r => r.data?.data ?? r.data)
                        .catch(() => null)
                  )).then(arr => arr.filter(Boolean))
                : [];

            const byId = new Map();
            reqArrs.flat().forEach(r => { if (r?.id != null) byId.set(r.id, r); });

            customPosFull.forEach(po => {
                const items = po.items || [];
                items.forEach(item => {
                    const itemType = item.item_type || item.type;
                    if (!itemType || (typeFilter && itemType !== typeFilter)) return;
                    const qty = parseFloat(item.quantity ?? 0) || 0;
                    if (qty <= 0) return;
                    const syntheticId = `ff:${po.id}:${item.id}`;
                    byId.set(syntheticId, {
                        id:                   syntheticId,
                        status:               'PO_RAISED',
                        type:                 itemType,
                        po_code:              po.po_code || po.code,
                        po_id:                po.id,
                        quantity_required:    qty,
                        meters_required:      itemType === 'fabric' ? qty : undefined,
                        unit_of_measure:      item.uom,
                        urgency:              'normal',
                        is_free_form:         true,
                        created_at:           po.expected_delivery_date || po.created_at,
                        // bucket-key fields
                        fabric_type_id:       item.fabric_type_id,
                        fabric_type_name:     item.fabric_type_name,
                        fabric_color_id:      item.fabric_color_id,
                        fabric_color_name:    item.fabric_color_name,
                        fabric_color_number:  item.fabric_color_number,
                        trim_item_id:         item.trim_item_id,
                        trim_item_name:       item.trim_item_name,
                        trim_item_code:       item.trim_item_code,
                        trim_item_variant_id: item.trim_item_variant_id,
                        variant_color_name:   item.variant_color_name,
                        variant_color_number: item.variant_color_number,
                        variant_size:         item.variant_size,
                        variant_in_stock:     item.variant_in_stock,
                    });
                });
            });

            setRequirements([...byId.values()]);
        } catch {
            setRequirements([]);
        } finally {
            setLoading(false);
        }
    }, [typeFilter, statusFilter, viewMode]);

    useEffect(() => { fetchRequirements(); }, [fetchRequirements]);

    const filtered = search.trim()
        ? requirements.filter(r => {
            const q = search.toLowerCase();
            return [
                r.product_name, r.trim_item_name, r.trim_item_code,
                r.fabric_type_name, r.fabric_color_name,
                r.variant_color_name, r.variant_color_number, r.variant_size,
                r.customer_name, r.order_number, r.buyer_po_number,
                r.raised_by_name, r.po_code,
                r.spare_part_name, r.spare_part_number, r.description,
            ].some(v => (v || '').toLowerCase().includes(q));
          })
        : requirements;

    // Sort: urgent → high → normal → low; within same urgency, newest first
    const sorted = [...filtered].sort((a, b) => {
        const ua = URGENCY_RANK[(a.urgency || '').toLowerCase()] ?? 1;
        const ub = URGENCY_RANK[(b.urgency || '').toLowerCase()] ?? 1;
        if (ua !== ub) return ua - ub;
        return new Date(b.created_at) - new Date(a.created_at);
    });

    // Material buckets:
    //   fabric: fabric_type → fabric_color      → rows  (two-tier)
    //   trim  : trim_item   → trim_item_variant → rows  (two-tier)
    //   spare : spare_part                      → rows  (flat)
    //   other : description                     → rows  (flat)
    const materialBuckets = useMemo(() => {
        const fabricItemMap = new Map();
        const trimItemMap   = new Map();
        const spareItemMap  = new Map();
        const otherItemMap  = new Map();

        sorted.forEach(req => {
            if (req.type === 'fabric') {
                const typeKey = req.fabric_type_id ?? req.fabric_type_name ?? `type-${req.id}`;
                if (!fabricItemMap.has(typeKey)) {
                    fabricItemMap.set(typeKey, {
                        type:           'fabric',
                        key:            `fabric-item:${typeKey}`,
                        label:          req.fabric_type_name || 'Fabric',
                        fabric_type_id: req.fabric_type_id,
                        variantMap:     new Map(),
                    });
                }
                const item = fabricItemMap.get(typeKey);
                const subKey = req.fabric_color_id ?? req.fabric_color_name ?? `color-${req.id}`;
                if (!item.variantMap.has(subKey)) {
                    item.variantMap.set(subKey, {
                        type:            'fabric-color',
                        key:             `${item.key}::color:${subKey}`,
                        label:           req.fabric_color_name || 'No color',
                        color_number:    req.fabric_color_number,
                        fabric_color_id: req.fabric_color_id,
                        in_stock:        req.variant_in_stock,
                        rows:            [],
                    });
                }
                item.variantMap.get(subKey).rows.push(req);
            } else if (req.type === 'trim') {
                const itemKey = req.trim_item_id ?? req.trim_item_name ?? `item-${req.id}`;
                if (!trimItemMap.has(itemKey)) {
                    trimItemMap.set(itemKey, {
                        type:         'trim',
                        key:          `trim-item:${itemKey}`,
                        label:        req.trim_item_name || 'Trim',
                        code:         req.trim_item_code,
                        trim_item_id: req.trim_item_id ?? null,
                        variantMap:   new Map(),
                    });
                }
                const item = trimItemMap.get(itemKey);
                const subKey = req.trim_item_variant_id ?? `var-${req.id}`;
                if (!item.variantMap.has(subKey)) {
                    item.variantMap.set(subKey, {
                        type:                 'trim-variant',
                        key:                  `${item.key}::var:${subKey}`,
                        label:                req.variant_color_name || req.trim_item_code || 'No variant',
                        color_number:         req.variant_color_number,
                        variant_size:         req.variant_size || null,
                        trim_item_variant_id: req.trim_item_variant_id,
                        in_stock:             req.variant_in_stock,
                        rows:                 [],
                    });
                }
                item.variantMap.get(subKey).rows.push(req);
            } else if (req.type === 'spare') {
                const itemKey = req.spare_part_id ?? req.spare_part_name ?? `spare-${req.id}`;
                if (!spareItemMap.has(itemKey)) {
                    spareItemMap.set(itemKey, {
                        type:  'spare',
                        key:   `spare-item:${itemKey}`,
                        label: req.spare_part_name
                            ? `${req.spare_part_name}${req.spare_part_number ? ` (${req.spare_part_number})` : ''}`
                            : 'Spare Part',
                        rows: [],
                    });
                }
                spareItemMap.get(itemKey).rows.push(req);
            } else {
                const itemKey = req.description ?? `other-${req.id}`;
                if (!otherItemMap.has(itemKey)) {
                    otherItemMap.set(itemKey, {
                        type:  'other',
                        key:   `other-item:${itemKey}`,
                        label: req.description || 'Other',
                        rows:  [],
                    });
                }
                otherItemMap.get(itemKey).rows.push(req);
            }
        });

        const buildBucket = (item, type) => {
            const variants = [...item.variantMap.values()]
                .map(v => ({ ...v, stats: bucketStats(v.rows) }))
                .sort((a, b) => {
                    const aQty = type === 'fabric' ? a.stats.totalMeters : a.stats.totalQty;
                    const bQty = type === 'fabric' ? b.stats.totalMeters : b.stats.totalQty;
                    return bQty - aQty;
                });
            const allRows = variants.flatMap(v => v.rows);
            return {
                type,
                key:            item.key,
                label:          item.label,
                code:           item.code,
                trim_item_id:   item.trim_item_id,
                fabric_type_id: item.fabric_type_id,
                variants,
                stats:          bucketStats(allRows),
            };
        };

        const buildFlatBucket = (item, type) => ({
            type,
            key:    item.key,
            label:  item.label,
            isFlat: true,
            rows:   item.rows,
            stats:  bucketStats(item.rows),
        });

        const fabricBuckets = [...fabricItemMap.values()].map(item => buildBucket(item, 'fabric'));
        const trimBuckets   = [...trimItemMap.values()].map(item => buildBucket(item, 'trim'));
        const spareBuckets  = [...spareItemMap.values()].map(item => buildFlatBucket(item, 'spare'));
        const otherBuckets  = [...otherItemMap.values()].map(item => buildFlatBucket(item, 'other'));

        const all = [...trimBuckets, ...fabricBuckets, ...spareBuckets, ...otherBuckets];
        all.sort((a, b) => {
            const ua = URGENCY_RANK[a.stats.urgency] ?? 1;
            const ub = URGENCY_RANK[b.stats.urgency] ?? 1;
            if (ua !== ub) return ua - ub;
            return b.stats.rowCount - a.stats.rowCount;
        });
        return all;
    }, [sorted]);

    const toggleSelect = (id) => {
        setSelected(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    const toggleAll = () => {
        if (selected.size === sorted.length) {
            setSelected(new Set());
        } else {
            setSelected(new Set(sorted.map(r => r.id)));
        }
    };

    const bucketSelection = (rows) => {
        if (rows.length === 0) return 'none';
        let count = 0;
        rows.forEach(r => { if (selected.has(r.id)) count++; });
        if (count === 0) return 'none';
        if (count === rows.length) return 'all';
        return 'some';
    };

    const toggleBucketSelect = (rows) => {
        const sel = bucketSelection(rows);
        setSelected(prev => {
            const next = new Set(prev);
            if (sel === 'all') {
                rows.forEach(r => next.delete(r.id));
            } else {
                rows.forEach(r => next.add(r.id));
            }
            return next;
        });
    };

    const toggleExpand = (key) => {
        setExpandedKeys(prev => {
            const next = new Set(prev);
            next.has(key) ? next.delete(key) : next.add(key);
            return next;
        });
    };

    const visibleBuckets = useMemo(() => {
        // The "Hide fully-ordered" toggle is only meaningful under the All tab
        // (where buckets carry both PENDING + PO_RAISED rows). When a specific
        // status tab is active, the bucket has already been narrowed by fetch.
        if (statusFilter === '' && hideFullyOrdered) {
            return materialBuckets.filter(b => b.stats.pendingCount > 0);
        }
        return materialBuckets;
    }, [materialBuckets, hideFullyOrdered, statusFilter]);

    const hiddenBucketCount = materialBuckets.length - visibleBuckets.length;

    const allBucketKeys = useMemo(() => {
        const keys = [];
        visibleBuckets.forEach(b => {
            keys.push(b.key);
            if (b.variants) b.variants.forEach(v => keys.push(v.key));
        });
        return keys;
    }, [visibleBuckets]);
    const allExpanded = allBucketKeys.length > 0 && allBucketKeys.every(k => expandedKeys.has(k));
    const toggleExpandAll = () => {
        setExpandedKeys(allExpanded ? new Set() : new Set(allBucketKeys));
    };

    const selectedRequirements = sorted.filter(r => selected.has(r.id));

    const handlePOCreated = () => {
        setShowPOModal(false);
        setSelected(new Set());
        fetchRequirements();
    };

    const createPoForRows = (rows) => {
        const pendable = rows.filter(r => r.status === 'PENDING');
        if (pendable.length === 0) return;
        setSelected(new Set(pendable.map(r => r.id)));
        setShowPOModal(true);
    };

    const handleRejectReq = async (req) => {
        if (!req?.id) return;
        const qty = req.type === 'fabric'
            ? `${fmt(req.meters_required)} m`
            : `${fmt(req.quantity_required, 0)} ${req.unit_of_measure || req.trim_uom || 'pcs'}`;
        const msg = `Reject this requirement?\n\n${reqTitle(req)}\n${qty} · SO ${req.order_number || '—'}\n\nThis cannot be undone from the buyer side — store/merch will need to re-raise if it's still needed.`;
        if (!window.confirm(msg)) return;
        try {
            await purchaseDeptApi.cancelRequirement(req.id);
            // Drop the rejected row's selection if it was checked
            setSelected(prev => {
                if (!prev.has(req.id)) return prev;
                const next = new Set(prev);
                next.delete(req.id);
                return next;
            });
            fetchRequirements();
        } catch (e) {
            alert(e?.response?.data?.error || 'Failed to reject requirement');
        }
    };

    const openPoFromReq = async (req) => {
        if (!req?.po_code && !req?.po_id) return;
        setLoadingPoCode(req.po_code || `id:${req.po_id}`);
        try {
            // Prefer direct id lookup when present, otherwise resolve by code.
            let po = null;
            if (req.po_id) {
                const r = await purchaseDeptApi.getOrderById(req.po_id);
                po = r.data?.data ?? r.data;
            } else {
                const listRes = await purchaseDeptApi.getOrders({ code: req.po_code });
                const list    = listRes.data?.data ?? listRes.data ?? [];
                const arr     = Array.isArray(list) ? list : [list];
                const match   = arr.find(p => p.po_code === req.po_code || p.code === req.po_code);
                if (match?.id) {
                    const detail = await purchaseDeptApi.getOrderById(match.id);
                    po = detail.data?.data ?? detail.data;
                }
            }
            if (po) setViewingPo(po);
        } catch {
            // swallow — could surface a toast later
        } finally {
            setLoadingPoCode(null);
        }
    };

    // Group by urgency for display
    const URGENCY_GROUPS = ['urgent', 'high', 'normal', 'low'];
    const groups = URGENCY_GROUPS
        .map(urgency => ({ urgency, items: sorted.filter(r => (r.urgency || 'normal').toLowerCase() === urgency) }))
        .filter(g => g.items.length > 0);

    return (
        <div className="p-4 sm:p-6 space-y-5">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-xl font-bold text-slate-800">Purchase Requirements</h1>
                    <p className="text-sm text-slate-500 mt-0.5">Review requirements raised by team, then bundle into purchase orders</p>
                </div>
                {selected.size > 0 && (
                    <button
                        onClick={() => setShowPOModal(true)}
                        className="flex items-center gap-2 text-sm font-bold text-white bg-orange-500 hover:bg-orange-600 px-4 py-2 rounded-xl shadow-sm transition-colors"
                    >
                        <ShoppingCart size={15} />
                        Create PO ({selected.size})
                    </button>
                )}
            </div>

            {/* Status tabs — primary split between new (PENDING) and on-order (PO_RAISED) work. */}
            <div className="flex items-center gap-1 border-b border-slate-200 -mb-px overflow-x-auto">
                {STATUS_TABS.map(t => {
                    const active = statusFilter === t.key;
                    const count = statusCounts[t.key] ?? 0;
                    return (
                        <button
                            key={t.key || 'all'}
                            onClick={() => setStatusFilter(t.key)}
                            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-bold border-b-2 transition-colors whitespace-nowrap ${
                                active
                                    ? 'border-orange-500 text-slate-900'
                                    : 'border-transparent text-slate-500 hover:text-slate-700'
                            }`}
                        >
                            {t.label}
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${t.chip}`}>
                                {count}
                            </span>
                        </button>
                    );
                })}
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-3">
                <div className="relative flex-1 min-w-48">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                        type="text"
                        placeholder="Search requirements…"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="w-full text-sm border border-slate-200 rounded-xl pl-9 pr-3 py-2 focus:outline-none focus:border-orange-400"
                    />
                </div>
                <div className="flex items-center gap-1.5 text-sm flex-wrap">
                    <Filter size={13} className="text-slate-400" />
                    {['', 'fabric', 'trim', 'spare', 'other'].map(t => (
                        <button
                            key={t}
                            onClick={() => setTypeFilter(t)}
                            className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${typeFilter === t ? 'bg-orange-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                        >
                            {t === '' ? 'All Types' : t.charAt(0).toUpperCase() + t.slice(1)}
                        </button>
                    ))}
                </div>
                <div className="flex items-center gap-1 text-sm bg-slate-100 rounded-lg p-0.5">
                    <button
                        onClick={() => setViewMode('grouped')}
                        title="Group by material"
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md font-medium transition-colors ${viewMode === 'grouped' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        <Layers size={13} /> Material
                    </button>
                    <button
                        onClick={() => setViewMode('flat')}
                        title="Show every requirement row"
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md font-medium transition-colors ${viewMode === 'flat' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        <List size={13} /> Rows
                    </button>
                </div>
                {viewMode === 'grouped' && materialBuckets.length > 0 && (
                    <>
                        {statusFilter === '' && (
                            <button
                                onClick={() => setHideFullyOrdered(v => !v)}
                                className={`flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-md ${hideFullyOrdered ? 'text-slate-500 hover:bg-slate-100 hover:text-slate-700' : 'text-blue-700 bg-blue-50 hover:bg-blue-100'}`}
                                title={hideFullyOrdered ? 'Currently hiding buckets where everything is on order' : 'Currently showing all buckets including fully ordered'}
                            >
                                {hideFullyOrdered ? 'Active only' : 'Including fully ordered'}
                                {hiddenBucketCount > 0 && hideFullyOrdered && (
                                    <span className="text-[10px] font-bold text-slate-400">· {hiddenBucketCount} hidden</span>
                                )}
                            </button>
                        )}
                        <button
                            onClick={toggleExpandAll}
                            className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 px-2 py-1 rounded-md hover:bg-slate-100"
                            title={allExpanded ? 'Collapse all' : 'Expand all'}
                        >
                            {allExpanded ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
                            {allExpanded ? 'Collapse all' : 'Expand all'}
                        </button>
                    </>
                )}
            </div>

            {/* Select all bar */}
            {sorted.length > 0 && (
                <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5">
                    <button onClick={toggleAll} className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-800">
                        {selected.size === sorted.length && sorted.length > 0
                            ? <CheckSquare size={15} className="text-orange-500" />
                            : <Square size={15} />
                        }
                        {selected.size === 0 ? 'Select all for PO' : `${selected.size} of ${sorted.length} selected`}
                    </button>
                    {selected.size > 0 && (
                        <button onClick={() => setSelected(new Set())} className="ml-auto text-xs text-slate-400 hover:text-slate-600">
                            Clear selection
                        </button>
                    )}
                </div>
            )}

            {/* Content */}
            {loading ? (
                <div className="flex justify-center items-center py-20">
                    <Loader2 className="animate-spin h-7 w-7 text-orange-400" />
                </div>
            ) : sorted.length === 0 ? (
                <div className="text-center py-20 text-slate-400">
                    <ShoppingCart size={40} className="mx-auto mb-3 opacity-30" />
                    <p className="font-medium">No requirements found</p>
                    <p className="text-sm mt-1">Try changing filters or wait for new requirements</p>
                </div>
            ) : viewMode === 'grouped' ? (
                <div className="space-y-3">
                    {visibleBuckets.length === 0 && hiddenBucketCount > 0 && (
                        <div className="text-center py-12 text-slate-400">
                            <p className="text-sm font-medium">All requirements covered — every bucket is on order.</p>
                            <button
                                onClick={() => setHideFullyOrdered(false)}
                                className="mt-2 text-xs font-bold text-blue-600 hover:text-blue-700 underline"
                            >
                                Show {hiddenBucketCount} fully-ordered bucket{hiddenBucketCount !== 1 ? 's' : ''}
                            </button>
                        </div>
                    )}
                    {visibleBuckets.map(bucket => {
                        const allRows  = bucket.isFlat ? bucket.rows : bucket.variants.flatMap(v => v.rows);
                        const sel      = bucketSelection(allRows);
                        const isOpen   = expandedKeys.has(bucket.key);
                        const ucfg     = URGENCY_CFG[bucket.stats.urgency] || URGENCY_CFG.normal;
                        const isFabric = bucket.type === 'fabric';
                        const typeCfg  = TYPE_CFG[bucket.type] || TYPE_CFG.other;
                        const TypeIcon = typeCfg.icon;
                        const pendable = allRows.filter(r => r.status === 'PENDING').length;
                        const headStock = bucket.isFlat ? 0 : bucket.variants.reduce((s, v) => s + (Number(v.in_stock) || 0), 0);
                        const headPending = isFabric ? bucket.stats.pendingMeters : bucket.stats.pendingQty;
                        const headOnOrder = isFabric ? bucket.stats.onOrderMeters : bucket.stats.onOrderQty;
                        const headShortfall = Math.max(0, headPending - headStock - headOnOrder);
                        const subLabel = isFabric ? 'color' : 'variant';
                        const variantCount = bucket.isFlat ? bucket.rows.length : bucket.variants.length;
                        const subLabelText = bucket.isFlat ? 'request' : subLabel;

                        return (
                            <div
                                key={bucket.key}
                                className={`bg-white border rounded-2xl transition-all ${
                                    sel === 'all'  ? 'border-orange-300 ring-1 ring-orange-200' :
                                    sel === 'some' ? 'border-orange-200' :
                                                     'border-slate-200'
                                }`}
                            >
                                <div
                                    className="flex items-center gap-3 p-4 cursor-pointer select-none"
                                    onClick={() => toggleExpand(bucket.key)}
                                >
                                    <button
                                        onClick={e => { e.stopPropagation(); toggleBucketSelect(allRows); }}
                                        className="shrink-0"
                                        title={sel === 'all' ? 'Deselect all rows' : 'Select all rows'}
                                    >
                                        {sel === 'all'  ? <CheckSquare size={17} className="text-orange-500" />
                                         : sel === 'some' ? <CheckSquare size={17} className="text-orange-300" />
                                         :                  <Square      size={17} className="text-slate-300" />}
                                    </button>

                                    <div className={`p-1.5 rounded-lg shrink-0 ${typeCfg.cls}`}>
                                        <TypeIcon size={14} />
                                    </div>

                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="text-sm font-semibold text-slate-800 truncate">
                                                {bucket.label}
                                                {bucket.code ? (
                                                    <span className="text-slate-400 font-mono text-[10px] ml-1.5">{bucket.code}</span>
                                                ) : null}
                                            </span>
                                            <span className={`inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full border ${ucfg.cls}`}>
                                                <span className={`w-1 h-1 rounded-full ${ucfg.dot}`} />
                                                {ucfg.label}
                                            </span>
                                            <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600">
                                                {variantCount} {subLabelText}{variantCount !== 1 ? 's' : ''}
                                            </span>
                                            {bucket.stats.substituteCount > 0 && !isFabric && (
                                                <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
                                                    🔄 {bucket.stats.substituteCount} sub
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-xs text-slate-500 mt-0.5">
                                            {bucket.stats.pendingCount > 0 && statusFilter !== 'PO_RAISED' && (
                                                <span>{bucket.stats.pendingCount} pending</span>
                                            )}
                                            {bucket.stats.onOrderCount > 0 && statusFilter !== 'PENDING' && (
                                                <span>{bucket.stats.pendingCount > 0 && statusFilter !== 'PO_RAISED' ? ' · ' : ''}<span className="text-blue-600">{bucket.stats.onOrderCount} on order</span></span>
                                            )}
                                            {' · '}{bucket.stats.soCount} SO{bucket.stats.soCount !== 1 ? 's' : ''}
                                            {bucket.stats.customerCount > 1 ? ` · ${bucket.stats.customerCount} customers` : ''}
                                            {bucket.stats.earliestDate ? ` · earliest ${fmtDate(bucket.stats.earliestDate)}` : ''}
                                        </p>
                                    </div>

                                    <div className="shrink-0 text-right">
                                        <p className="text-sm font-bold text-slate-700">
                                            {isFabric ? `${fmt(bucket.stats.totalMeters)} m` : `${fmt(bucket.stats.totalQty, 0)} pcs`}
                                            <span className="text-[9px] font-medium text-slate-400 ml-1">needed</span>
                                        </p>
                                        {headPending > 0 && (
                                            <p className="text-[9px] font-bold text-orange-600">
                                                {isFabric ? `${fmt(headPending)} m` : `${fmt(headPending, 0)} pcs`} to PO
                                            </p>
                                        )}
                                        {headOnOrder > 0 && (
                                            <p className="text-[9px] font-bold text-blue-600">
                                                {isFabric ? `${fmt(headOnOrder)} m` : `${fmt(headOnOrder, 0)} pcs`} on order
                                                {bucket.stats.poCount > 0 ? ` · ${bucket.stats.poCount} PO${bucket.stats.poCount > 1 ? 's' : ''}` : ''}
                                            </p>
                                        )}
                                        {headStock > 0 && (
                                            headShortfall > 0
                                                ? <p className="text-[9px] font-bold text-red-500">−{isFabric ? `${fmt(headShortfall)} m` : `${fmt(headShortfall, 0)}`} short of stock</p>
                                                : <p className="text-[9px] text-emerald-600 font-medium">stock OK · {isFabric ? `${fmt(headStock)} m` : `${fmt(headStock, 0)}`}</p>
                                        )}
                                    </div>

                                    {pendable > 0 && (
                                        <button
                                            onClick={e => { e.stopPropagation(); createPoForRows(allRows); }}
                                            className="shrink-0 flex items-center gap-1 text-[11px] font-bold text-orange-600 bg-orange-50 hover:bg-orange-100 border border-orange-200 px-2 py-1 rounded-lg transition-colors"
                                            title="Create PO covering all pending rows in this bucket"
                                        >
                                            <ShoppingCart size={11} /> PO
                                        </button>
                                    )}

                                    <div className="shrink-0 text-slate-400">
                                        {isOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                                    </div>
                                </div>

                                {isOpen && bucket.isFlat && (
                                    <div className="px-4 pb-3 pt-0 border-t border-slate-100">
                                        <div className="space-y-1 pt-3">
                                            {bucket.rows.map(r => (
                                                <LeafRow
                                                    key={r.id}
                                                    req={r}
                                                    isFabric={false}
                                                    isSelected={selected.has(r.id)}
                                                    onToggle={toggleSelect}
                                                    onOpenPo={openPoFromReq}
                                                    openingPo={loadingPoCode === r.po_code}
                                                    onReject={handleRejectReq}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {isOpen && !bucket.isFlat && (
                                    <div className="px-4 pb-3 pt-0 border-t border-slate-100">
                                        <div className="space-y-2 pt-3">
                                            {bucket.variants.map(v => {
                                                const vSel     = bucketSelection(v.rows);
                                                const vOpen    = expandedKeys.has(v.key);
                                                const stock    = Number(v.in_stock) || 0;
                                                const vPending = isFabric ? v.stats.pendingMeters : v.stats.pendingQty;
                                                const vOnOrder = isFabric ? v.stats.onOrderMeters : v.stats.onOrderQty;
                                                const short    = Math.max(0, vPending - stock - vOnOrder);
                                                const vPend    = v.rows.filter(r => r.status === 'PENDING').length;
                                                    return (
                                                        <div
                                                            key={v.key}
                                                            className={`rounded-xl border ${
                                                                vSel === 'all'  ? 'border-orange-300 bg-orange-50/30' :
                                                                vSel === 'some' ? 'border-orange-200 bg-white' :
                                                                                  'border-slate-200 bg-slate-50/40'
                                                            }`}
                                                        >
                                                            <div
                                                                className="flex items-center gap-3 px-3 py-2 cursor-pointer select-none"
                                                                onClick={() => toggleExpand(v.key)}
                                                            >
                                                                <button
                                                                    onClick={e => { e.stopPropagation(); toggleBucketSelect(v.rows); }}
                                                                    className="shrink-0"
                                                                >
                                                                    {vSel === 'all'  ? <CheckSquare size={15} className="text-orange-500" />
                                                                     : vSel === 'some' ? <CheckSquare size={15} className="text-orange-300" />
                                                                     :                   <Square      size={15} className="text-slate-300" />}
                                                                </button>
                                                                <div className="flex-1 min-w-0">
                                                                    <p className="text-xs font-semibold text-slate-700 truncate">
                                                                        {v.label}
                                                                        {v.color_number ? <span className="text-slate-400 font-normal"> · {v.color_number}</span> : ''}
                                                                        {v.variant_size && (
                                                                            <span className="ml-1.5 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-200 text-slate-700 align-middle">
                                                                                Sz {v.variant_size}
                                                                            </span>
                                                                        )}
                                                                        {v.stats.substituteCount > 0 && !isFabric && (
                                                                            <span className="ml-1.5 text-[8px] font-bold uppercase tracking-wider px-1 py-0.5 rounded bg-amber-100 text-amber-700 align-middle">
                                                                                🔄 {v.stats.substituteCount} sub
                                                                            </span>
                                                                        )}
                                                                    </p>
                                                                    <p className="text-[10px] text-slate-500 mt-0.5">
                                                                        {v.stats.pendingCount > 0 && <span>{v.stats.pendingCount} pending</span>}
                                                                        {v.stats.onOrderCount > 0 && (
                                                                            <span>{v.stats.pendingCount > 0 ? ' · ' : ''}<span className="text-blue-600">{v.stats.onOrderCount} on order</span></span>
                                                                        )}
                                                                        {' · '}{v.stats.soCount} SO{v.stats.soCount !== 1 ? 's' : ''}
                                                                        {v.in_stock != null && ` · stock ${fmt(stock, 0)}`}
                                                                    </p>
                                                                </div>
                                                                <div className="shrink-0 text-right">
                                                                    <p className="text-xs font-bold text-slate-700">
                                                                        {isFabric ? `${fmt(v.stats.totalMeters)} m` : `${fmt(v.stats.totalQty, 0)}`} <span className="text-[9px] font-medium text-slate-400">needed</span>
                                                                    </p>
                                                                    {vPending > 0 && (
                                                                        <p className="text-[9px] font-bold text-orange-600">{isFabric ? `${fmt(vPending)} m` : `${fmt(vPending, 0)}`} to PO</p>
                                                                    )}
                                                                    {vOnOrder > 0 && (
                                                                        <p className="text-[9px] font-bold text-blue-600">{isFabric ? `${fmt(vOnOrder)} m` : `${fmt(vOnOrder, 0)}`} on order</p>
                                                                    )}
                                                                    {v.in_stock != null && (
                                                                        short > 0
                                                                            ? <p className="text-[9px] font-bold text-red-500">−{isFabric ? `${fmt(short)} m` : `${fmt(short, 0)}`} short · stock {isFabric ? `${fmt(stock)} m` : fmt(stock, 0)}</p>
                                                                            : <p className="text-[9px] text-emerald-600 font-medium">stock OK · {isFabric ? `${fmt(stock)} m` : fmt(stock, 0)}</p>
                                                                    )}
                                                                </div>
                                                                {vPend > 0 && (
                                                                    <button
                                                                        onClick={e => { e.stopPropagation(); createPoForRows(v.rows); }}
                                                                        className="shrink-0 flex items-center gap-1 text-[10px] font-bold text-orange-600 bg-orange-50 hover:bg-orange-100 border border-orange-200 px-1.5 py-0.5 rounded-md transition-colors"
                                                                        title="Create PO for this variant"
                                                                    >
                                                                        <ShoppingCart size={10} /> PO
                                                                    </button>
                                                                )}
                                                                <div className="shrink-0 text-slate-400">
                                                                    {vOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                                                                </div>
                                                            </div>
                                                            {vOpen && (
                                                                <div className="px-3 pb-2 pt-0 space-y-1">
                                                                    {v.rows.map(r => (
                                                                        <LeafRow
                                                                            key={r.id}
                                                                            req={r}
                                                                            isFabric={isFabric}
                                                                            isSelected={selected.has(r.id)}
                                                                            onToggle={toggleSelect}
                                                                            onOpenPo={openPoFromReq}
                                                                            openingPo={loadingPoCode === r.po_code}
                                                                            onReject={handleRejectReq}
                                                                        />
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div className="space-y-4">
                    {groups.map(({ urgency, items }) => {
                        const ucfg = URGENCY_CFG[urgency] || URGENCY_CFG.normal;
                        return (
                            <div key={urgency}>
                                <div className="flex items-center gap-2 mb-2">
                                    <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full border ${ucfg.cls}`}>
                                        <span className={`w-1.5 h-1.5 rounded-full ${ucfg.dot}`} />
                                        {ucfg.label} · {items.length}
                                    </span>
                                </div>
                                <div className="space-y-2">
                                    {items.map(req => {
                                        const isSelected = selected.has(req.id);
                                        const isExpanded = expandedId === req.id;
                                        const typeCfg    = TYPE_CFG[req.type] || TYPE_CFG.other;
                                        const TypeIcon   = typeCfg.icon;

                                        return (
                                            <div
                                                key={req.id}
                                                className={`bg-white border rounded-2xl transition-all ${isSelected ? 'border-orange-300 ring-1 ring-orange-200' : 'border-slate-200'}`}
                                            >
                                                <div
                                                    className="flex items-center gap-3 p-4 cursor-pointer select-none"
                                                    onClick={() => setExpandedId(isExpanded ? null : req.id)}
                                                >
                                                    {/* Checkbox */}
                                                    <button
                                                        onClick={e => { e.stopPropagation(); toggleSelect(req.id); }}
                                                        className="shrink-0"
                                                    >
                                                        {isSelected
                                                            ? <CheckSquare size={17} className="text-orange-500" />
                                                            : <Square size={17} className="text-slate-300" />
                                                        }
                                                    </button>

                                                    {/* Type icon */}
                                                    <div className={`p-1.5 rounded-lg shrink-0 ${typeCfg.cls}`}>
                                                        <TypeIcon size={14} />
                                                    </div>

                                                    {/* Main content */}
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            <span className="text-sm font-semibold text-slate-800 truncate">
                                                                {reqTitle(req)}
                                                            </span>
                                                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${typeCfg.cls}`}>
                                                                {typeCfg.label}
                                                            </span>
                                                            {req.is_substitute === true && req.type === 'trim' && (
                                                                <span title={`Planned ${req.fabric_color_name || '—'}${req.fabric_color_number ? ` · ${req.fabric_color_number}` : ''} → buying ${req.variant_color_name || '—'}${req.variant_color_number ? ` · ${req.variant_color_number}` : ''}`}
                                                                    className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
                                                                    🔄 Sub
                                                                </span>
                                                            )}
                                                        </div>
                                                        <p className="text-xs text-slate-500 mt-0.5">
                                                            {req.is_standalone
                                                                ? <span className="text-emerald-700 font-semibold">Standalone</span>
                                                                : (req.order_number || 'No SO linked')}
                                                            {req.customer_name ? ` · ${req.customer_name}` : ''}
                                                            {req.product_name ? ` · ${req.product_name}` : ''}
                                                            {req.raised_by_name ? ` · by ${req.raised_by_name}` : ''}
                                                            {req.created_at ? ` · ${fmtDate(req.created_at)}` : ''}
                                                        </p>
                                                    </div>

                                                    {/* Quantity */}
                                                    <div className="shrink-0 text-right">
                                                        <p className="text-sm font-bold text-slate-700">
                                                            {req.type === 'fabric'
                                                                ? `${fmt(req.meters_required)} m`
                                                                : `${fmt(req.quantity_required, 0)} ${req.unit_of_measure || req.trim_uom || 'pcs'}`}
                                                        </p>
                                                        <p className={`text-[9px] uppercase font-bold px-1.5 py-0.5 rounded-full border inline-block mt-0.5 ${(STATUS_CFG[req.status] || STATUS_CFG.PENDING).cls}`}>
                                                            {(STATUS_CFG[req.status] || { label: req.status || 'PENDING' }).label}
                                                        </p>
                                                    </div>

                                                    {req.status === 'PENDING' && (
                                                        <button
                                                            type="button"
                                                            onClick={(e) => { e.stopPropagation(); handleRejectReq(req); }}
                                                            title="Reject — cannot fulfill"
                                                            className="shrink-0 p-1.5 rounded-lg text-slate-300 hover:text-red-600 hover:bg-red-50 transition-colors"
                                                        >
                                                            <Ban size={14} />
                                                        </button>
                                                    )}

                                                    {/* Expand chevron */}
                                                    <div className="shrink-0 text-slate-400">
                                                        {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                                                    </div>
                                                </div>

                                                {/* Expanded detail */}
                                                {isExpanded && (
                                                    <div className="px-4 pb-4 pt-0 border-t border-slate-100 space-y-3">
                                                        {req.is_substitute === true && req.type === 'trim' && (
                                                            <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5">
                                                                <p className="text-[9px] font-bold text-amber-700 uppercase tracking-wider mb-0.5">🔄 Substitution</p>
                                                                <p className="text-xs text-amber-700">
                                                                    Planned: <span className="font-bold">{req.fabric_color_name || '—'}{req.fabric_color_number ? ` (${req.fabric_color_number})` : ''}</span>
                                                                    {' → '}
                                                                    Buying: <span className="font-bold">{req.variant_color_name || '—'}{req.variant_color_number ? ` (${req.variant_color_number})` : ''}</span>
                                                                </p>
                                                            </div>
                                                        )}

                                                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                                                            {req.fabric_type_name && (
                                                                <div>
                                                                    <p className="text-[9px] font-bold text-slate-400 uppercase mb-0.5">Fabric Type</p>
                                                                    <p className="font-medium text-slate-700">{req.fabric_type_name}</p>
                                                                </div>
                                                            )}
                                                            {req.type === 'fabric' && req.fabric_color_name && (
                                                                <div>
                                                                    <p className="text-[9px] font-bold text-slate-400 uppercase mb-0.5">Color</p>
                                                                    <p className="font-medium text-slate-700">{req.fabric_color_name}{req.fabric_color_number ? ` · ${req.fabric_color_number}` : ''}</p>
                                                                </div>
                                                            )}
                                                            {req.trim_item_name && (
                                                                <div>
                                                                    <p className="text-[9px] font-bold text-slate-400 uppercase mb-0.5">Trim Item</p>
                                                                    <p className="font-medium text-slate-700">{req.trim_item_name}</p>
                                                                </div>
                                                            )}
                                                            {req.trim_item_code && (
                                                                <div>
                                                                    <p className="text-[9px] font-bold text-slate-400 uppercase mb-0.5">Item Code</p>
                                                                    <p className="font-medium text-slate-700">{req.trim_item_code}</p>
                                                                </div>
                                                            )}
                                                            {req.variant_size && (
                                                                <div>
                                                                    <p className="text-[9px] font-bold text-slate-400 uppercase mb-0.5">Size</p>
                                                                    <p className="font-medium text-slate-700">{req.variant_size}</p>
                                                                </div>
                                                            )}
                                                            {req.variant_color_name && (
                                                                <div>
                                                                    <p className="text-[9px] font-bold text-slate-400 uppercase mb-0.5">Variant Color</p>
                                                                    <p className="font-medium text-slate-700">
                                                                        {req.variant_color_name}{req.variant_color_number ? ` · ${req.variant_color_number}` : ''}
                                                                    </p>
                                                                </div>
                                                            )}
                                                            {req.variant_in_stock != null && (
                                                                <div>
                                                                    <p className="text-[9px] font-bold text-slate-400 uppercase mb-0.5">In Stock</p>
                                                                    <p className={`font-bold ${Number(req.variant_in_stock) > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                                                        {Number(req.variant_in_stock).toLocaleString()}
                                                                    </p>
                                                                </div>
                                                            )}
                                                            {req.variant_last_purchase_price != null && (
                                                                <div>
                                                                    <p className="text-[9px] font-bold text-slate-400 uppercase mb-0.5">Last Purchase Price</p>
                                                                    <p className="font-medium text-slate-700">{parseFloat(req.variant_last_purchase_price).toFixed(2)}</p>
                                                                </div>
                                                            )}
                                                            {req.unit_price != null && (
                                                                <div>
                                                                    <p className="text-[9px] font-bold text-slate-400 uppercase mb-0.5">Unit Price (PO)</p>
                                                                    <p className="font-medium text-slate-700">{parseFloat(req.unit_price).toFixed(2)}</p>
                                                                </div>
                                                            )}
                                                            {req.buyer_po_number && (
                                                                <div>
                                                                    <p className="text-[9px] font-bold text-slate-400 uppercase mb-0.5">Buyer PO</p>
                                                                    <p className="font-medium text-slate-700">{req.buyer_po_number}</p>
                                                                </div>
                                                            )}
                                                            {req.po_code && (
                                                                <div>
                                                                    <p className="text-[9px] font-bold text-slate-400 uppercase mb-0.5">Linked PO</p>
                                                                    <button
                                                                        type="button"
                                                                        onClick={(e) => { e.stopPropagation(); openPoFromReq(req); }}
                                                                        disabled={loadingPoCode === req.po_code}
                                                                        className="font-mono text-blue-700 hover:text-blue-800 hover:underline disabled:opacity-50 inline-flex items-center gap-1"
                                                                    >
                                                                        {loadingPoCode === req.po_code && <Loader2 size={11} className="animate-spin" />}
                                                                        {req.po_code}
                                                                    </button>
                                                                </div>
                                                            )}
                                                        </div>

                                                        {req.type === 'spare' && req.spare_part_name && (
                                                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                                                                <div>
                                                                    <p className="text-[9px] font-bold text-slate-400 uppercase mb-0.5">Spare Part</p>
                                                                    <p className="font-medium text-slate-700">{req.spare_part_name}</p>
                                                                </div>
                                                                {req.spare_part_number && (
                                                                    <div>
                                                                        <p className="text-[9px] font-bold text-slate-400 uppercase mb-0.5">Part Number</p>
                                                                        <p className="font-mono text-slate-700">{req.spare_part_number}</p>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                        {req.type === 'other' && req.description && (
                                                            <div>
                                                                <p className="text-[9px] font-bold text-slate-400 uppercase mb-0.5">Description</p>
                                                                <p className="text-xs text-slate-700">{req.description}</p>
                                                            </div>
                                                        )}
                                                        {req.notes && (
                                                            <div>
                                                                <p className="text-[9px] font-bold text-slate-400 uppercase mb-0.5">Notes</p>
                                                                <p className="text-xs text-slate-600 italic">{req.notes}</p>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {showPOModal && (
                <CreatePoModal
                    requirements={selectedRequirements}
                    onClose={() => setShowPOModal(false)}
                    onCreated={handlePOCreated}
                />
            )}

            {viewingPo && (
                <PoDetailModal
                    po={viewingPo}
                    onClose={() => setViewingPo(null)}
                    onUpdated={() => { setViewingPo(null); fetchRequirements(); }}
                />
            )}
        </div>
    );
};

export default RequirementsPage;

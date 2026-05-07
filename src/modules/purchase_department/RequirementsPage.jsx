import { useState, useEffect, useCallback, useMemo } from 'react';
import {
    Loader2, Filter, CheckSquare, Square, ShoppingCart,
    AlertTriangle, ChevronDown, ChevronUp, X, Search,
    Package, Scissors, Tag,
} from 'lucide-react';
import { purchaseDeptApi } from '../../api/purchaseDeptApi';
import api from '../../utils/api';

const URGENCY_CFG = {
    urgent: { cls: 'bg-red-100 text-red-700 border-red-200',    dot: 'bg-red-500',    label: 'Urgent'  },
    normal: { cls: 'bg-blue-100 text-blue-700 border-blue-200',  dot: 'bg-blue-400',   label: 'Normal'  },
    low:    { cls: 'bg-slate-100 text-slate-600 border-slate-200', dot: 'bg-slate-400', label: 'Low'     },
};

const TYPE_CFG = {
    fabric: { icon: Package,  cls: 'bg-violet-100 text-violet-700', label: 'Fabric' },
    trim:   { icon: Scissors, cls: 'bg-amber-100 text-amber-700',   label: 'Trim'   },
    other:  { icon: Tag,      cls: 'bg-slate-100 text-slate-600',   label: 'Other'  },
};

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en', { dateStyle: 'medium' }) : '—';
const fmt = (n, dec = 1) => Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: dec });

const reqTitle = (req) => {
    if (req.type === 'fabric') {
        const parts = [req.fabric_type_name, req.fabric_color_name].filter(Boolean);
        return parts.length ? parts.join(' · ') : 'Fabric requirement';
    }
    if (req.type === 'trim') {
        return req.trim_item_name || 'Trim requirement';
    }
    return 'Requirement';
};

// ─── CREATE PO MODAL ─────────────────────────────────────────────────────────

const CreatePoModal = ({ requirements, onClose, onCreated }) => {
    const [supplierId,       setSupplierID]       = useState('');
    const [deliveryDate,     setDeliveryDate]     = useState('');
    const [unitPrices,       setUnitPrices]       = useState({});
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
                req.type === 'fabric' ? `fabric:${req.fabric_type_name || `id-${req.id}`}` :
                req.type === 'trim'   ? `trim:${req.trim_item_name   || `id-${req.id}`}` :
                `other:${req.id}`;
            if (!map.has(key)) {
                map.set(key, {
                    key,
                    type: req.type,
                    label:
                        req.type === 'fabric' ? (req.fabric_type_name || 'Fabric') :
                        req.type === 'trim'   ? (req.trim_item_name   || 'Trim')   :
                        'Other',
                    items: [],
                    totalMeters: 0,
                    totalQty: 0,
                    unitOfMeasure: req.unit_of_measure,
                });
            }
            const g = map.get(key);
            g.items.push(req);
            g.totalMeters += Number(req.meters_required || 0);
            g.totalQty    += Number(req.quantity_required || 0);
        });
        return [...map.values()];
    }, [requirements]);

    const handleSubmit = async () => {
        if (!supplierId)    { setErr('Please select a supplier'); return; }
        if (!deliveryDate)  { setErr('Please set an expected delivery date'); return; }
        setBusy(true); setErr(null);
        try {
            const flatUnitPrices = {};
            groups.forEach(g => {
                const price = unitPrices[g.key];
                if (price !== undefined && price !== '') {
                    g.items.forEach(item => { flatUnitPrices[item.id] = price; });
                }
            });
            await purchaseDeptApi.createOrder({
                supplier_id:            parseInt(supplierId),
                expected_delivery_date: deliveryDate,
                requirement_ids:        requirements.map(r => r.id),
                unit_prices:            flatUnitPrices,
            });
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
                                        <div className="flex items-center gap-3">
                                            <div className={`p-1.5 rounded-lg ${typeCfg.cls}`}>
                                                <TypeIcon size={13} />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-xs font-semibold text-slate-800 truncate">{g.label}</p>
                                                <p className="text-[10px] text-slate-500">
                                                    {isFabric
                                                        ? `${fmt(g.totalMeters)} m total`
                                                        : `${fmt(g.totalQty, 0)} ${g.unitOfMeasure || 'pcs'} total`}
                                                    {' · '}{g.items.length} requirement{g.items.length !== 1 ? 's' : ''}
                                                </p>
                                            </div>
                                            <div className="shrink-0">
                                                <input
                                                    type="number"
                                                    min="0"
                                                    step="any"
                                                    placeholder={isFabric ? 'Price / m' : `Price / ${g.unitOfMeasure || 'pc'}`}
                                                    value={unitPrices[g.key] || ''}
                                                    onChange={e => setUnitPrices(p => ({ ...p, [g.key]: e.target.value }))}
                                                    className="w-32 text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-orange-400 text-right"
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
                                                        : (item.trim_color_name
                                                            ? `${item.trim_color_name}${item.trim_color_number ? ` · ${item.trim_color_number}` : ''}`
                                                            : (item.trim_item_code || 'No variant'));
                                                    return (
                                                        <div key={item.id} className="flex items-center justify-between text-[10px] text-slate-500">
                                                            <span className="truncate">
                                                                {sub}{item.order_number ? ` · ${item.order_number}` : ''}
                                                            </span>
                                                            <span className="shrink-0 ml-2 font-medium">
                                                                {isFabric
                                                                    ? `${fmt(item.meters_required)} m`
                                                                    : `${fmt(item.quantity_required, 0)} ${item.unit_of_measure || 'pcs'}`}
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
                        <select
                            value={supplierId}
                            onChange={e => setSupplierID(e.target.value)}
                            className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:border-orange-400 bg-white"
                        >
                            <option value="">— Select supplier —</option>
                            {suppliers.map(s => (
                                <option key={s.id} value={s.id}>{s.name || s.username || `Supplier #${s.id}`}</option>
                            ))}
                        </select>
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

    const fetchRequirements = useCallback(async () => {
        setLoading(true);
        try {
            const params = {};
            if (typeFilter)   params.type   = typeFilter;
            if (statusFilter) params.status = statusFilter;
            const res = await purchaseDeptApi.getRequirements(params);
            console.log('Fetched requirements:', res.data);
            setRequirements(res.data?.data ?? res.data ?? []);
        } catch {
            setRequirements([]);
        } finally {
            setLoading(false);
        }
    }, [typeFilter, statusFilter]);

    useEffect(() => { fetchRequirements(); }, [fetchRequirements]);

    const filtered = search.trim()
        ? requirements.filter(r => {
            const q = search.toLowerCase();
            return [
                r.product_name, r.trim_item_name, r.trim_item_code,
                r.fabric_type_name, r.fabric_color_name,
                r.customer_name, r.order_number, r.buyer_po_number,
                r.raised_by_name,
            ].some(v => (v || '').toLowerCase().includes(q));
          })
        : requirements;

    // Sort: urgent first, then normal, then low; within same urgency, newest first
    const URGENCY_ORDER = { urgent: 0, normal: 1, low: 2 };
    const sorted = [...filtered].sort((a, b) => {
        const ua = URGENCY_ORDER[(a.urgency || '').toLowerCase()] ?? 1;
        const ub = URGENCY_ORDER[(b.urgency || '').toLowerCase()] ?? 1;
        if (ua !== ub) return ua - ub;
        return new Date(b.created_at) - new Date(a.created_at);
    });

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

    const selectedRequirements = sorted.filter(r => selected.has(r.id));

    const handlePOCreated = () => {
        setShowPOModal(false);
        setSelected(new Set());
        fetchRequirements();
    };

    // Group by urgency for display
    const URGENCY_GROUPS = ['urgent', 'normal', 'low'];
    const groups = URGENCY_GROUPS
        .map(urgency => ({ urgency, items: sorted.filter(r => (r.urgency || 'normal').toLowerCase() === urgency) }))
        .filter(g => g.items.length > 0);

    return (
        <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-5">
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
                <div className="flex items-center gap-1.5 text-sm">
                    <Filter size={13} className="text-slate-400" />
                    {['', 'fabric', 'trim'].map(t => (
                        <button
                            key={t}
                            onClick={() => setTypeFilter(t)}
                            className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${typeFilter === t ? 'bg-orange-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                        >
                            {t === '' ? 'All Types' : t.charAt(0).toUpperCase() + t.slice(1)}
                        </button>
                    ))}
                </div>
                <div className="flex items-center gap-1.5 text-sm">
                    {['PENDING', 'ACKNOWLEDGED', 'IN_PROGRESS', 'COMPLETED'].map(s => (
                        <button
                            key={s}
                            onClick={() => setStatusFilter(prev => prev === s ? '' : s)}
                            className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${statusFilter === s ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                        >
                            {s.charAt(0) + s.slice(1).toLowerCase().replace('_', ' ')}
                        </button>
                    ))}
                </div>
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
                                                        </div>
                                                        <p className="text-xs text-slate-500 mt-0.5">
                                                            {req.order_number || 'No SO linked'}
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
                                                                : `${fmt(req.quantity_required, 0)} ${req.unit_of_measure || 'pcs'}`}
                                                        </p>
                                                        <p className="text-[9px] text-slate-400 uppercase font-medium">
                                                            {req.status || 'PENDING'}
                                                        </p>
                                                    </div>

                                                    {/* Expand chevron */}
                                                    <div className="shrink-0 text-slate-400">
                                                        {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                                                    </div>
                                                </div>

                                                {/* Expanded detail */}
                                                {isExpanded && (
                                                    <div className="px-4 pb-4 pt-0 border-t border-slate-100 grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                                                        {req.fabric_type_name && (
                                                            <div>
                                                                <p className="text-[9px] font-bold text-slate-400 uppercase mb-0.5">Fabric Type</p>
                                                                <p className="font-medium text-slate-700">{req.fabric_type_name}</p>
                                                            </div>
                                                        )}
                                                        {req.fabric_color_name && (
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
                                                        {req.trim_color_name && (
                                                            <div>
                                                                <p className="text-[9px] font-bold text-slate-400 uppercase mb-0.5">Trim Color</p>
                                                                <p className="font-medium text-slate-700">{req.trim_color_name}{req.trim_color_number ? ` · ${req.trim_color_number}` : ''}</p>
                                                            </div>
                                                        )}
                                                        {req.buyer_po_number && (
                                                            <div>
                                                                <p className="text-[9px] font-bold text-slate-400 uppercase mb-0.5">Buyer PO</p>
                                                                <p className="font-medium text-slate-700">{req.buyer_po_number}</p>
                                                            </div>
                                                        )}
                                                        {req.notes && (
                                                            <div className="col-span-2 sm:col-span-3">
                                                                <p className="text-[9px] font-bold text-slate-400 uppercase mb-0.5">Notes</p>
                                                                <p className="text-slate-600 italic">{req.notes}</p>
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
        </div>
    );
};

export default RequirementsPage;

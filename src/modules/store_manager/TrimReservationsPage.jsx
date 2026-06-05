import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
    Package, Layers, Bookmark, Boxes, ClipboardList, Search, Filter,
    ChevronDown, ChevronRight, Loader2, AlertTriangle, CheckCircle2,
    Trash2, X, RotateCw,
} from 'lucide-react';

import { storeManagerApi } from '../../api/storeManagerApi';
import { planningApi } from '../../api/planningApi';

// --- helpers ---
const fmtNum = (n) => Number(n || 0).toLocaleString('en-IN');
const fmtDateTime = (s) => {
    if (!s) return '—';
    try { return new Date(s).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }); }
    catch { return s; }
};

// --- KPI card (matches SparesAnalyticsPage / QCAnalyticsDashboard pattern) ---
const KpiCard = ({ label, value, icon: Icon, colorClass, bgClass }) => (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex items-start gap-3">
        <div className={`p-2.5 rounded-lg ${bgClass} shrink-0`}>
            <Icon size={20} className={colorClass} />
        </div>
        <div className="min-w-0">
            <p className="text-xs font-semibold uppercase text-slate-500 tracking-wide">{label}</p>
            <p className={`text-2xl font-extrabold leading-tight ${colorClass}`}>{value}</p>
        </div>
    </div>
);

// --- Toast (auto-dismiss) ---
const Toast = ({ kind, message, onDismiss }) => {
    useEffect(() => {
        if (!message) return undefined;
        const t = setTimeout(onDismiss, 3500);
        return () => clearTimeout(t);
    }, [message, onDismiss]);
    if (!message) return null;
    const cls = kind === 'error'
        ? 'bg-red-600 text-white'
        : 'bg-emerald-600 text-white';
    return (
        <div className={`fixed bottom-4 right-4 z-[60] flex items-center gap-2 px-4 py-3 rounded-lg shadow-xl text-sm font-bold ${cls}`}>
            {kind === 'error' ? <AlertTriangle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
            <span>{message}</span>
        </div>
    );
};

const TrimReservationsPage = () => {
    // Filters (drive the fetch)
    const [salesOrderId, setSalesOrderId] = useState('');
    const [sopId,        setSopId]        = useState('');

    // Local search (client-side filter on fetched payload)
    const [search, setSearch] = useState('');

    // Server payload
    const [data,    setData]    = useState(null);
    const [loading, setLoading] = useState(true);
    const [error,   setError]   = useState(null);

    // Drill-down state — keyed by trim_item_id / variant_id
    const [expandedTrims,    setExpandedTrims]    = useState(() => new Set());
    const [expandedVariants, setExpandedVariants] = useState(() => new Set());

    // Release operation state — per reservation id
    const [releasingId, setReleasingId] = useState(null);
    const [rowErrors,   setRowErrors]   = useState({});
    const [toast,       setToast]       = useState(null);

    const fetchReservations = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const params = {};
            if (salesOrderId) params.sales_order_id = salesOrderId;
            if (sopId)        params.sales_order_product_id = sopId;
            const res = await storeManagerApi.getTrimReservations(params);
            const body = res.data?.data ?? res.data ?? { groups: [], totals: {} };
            setData(body);

            // Auto-expand rules: <5 trims → expand all; filter active → expand all;
            // otherwise leave the user's existing expand state.
            const trimCount = (body.groups || []).length;
            if (trimCount > 0 && (trimCount < 5 || salesOrderId || sopId)) {
                setExpandedTrims(new Set(body.groups.map(g => g.trim_item_id)));
                setExpandedVariants(new Set(
                    body.groups.flatMap(g => (g.variants || []).map(v => v.trim_item_variant_id))
                ));
            }
        } catch (e) {
            setError(e?.response?.data?.error || e?.message || 'Failed to load reservations.');
            setData({ groups: [], totals: {} });
        } finally {
            setLoading(false);
        }
    }, [salesOrderId, sopId]);

    useEffect(() => { fetchReservations(); }, [fetchReservations]);

    // --- derived: SO dropdown options from the fetched payload ---
    const salesOrderOptions = useMemo(() => {
        if (!data?.groups) return [];
        const seen = new Map();   // id -> { id, code, customer }
        data.groups.forEach(g => {
            (g.variants || []).forEach(v => {
                (v.reservations || []).forEach(r => {
                    if (r.sales_order_id != null && !seen.has(r.sales_order_id)) {
                        seen.set(r.sales_order_id, {
                            id: r.sales_order_id,
                            code: r.sales_order_code || `SO #${r.sales_order_id}`,
                            customer: r.customer_name || '',
                        });
                    }
                });
            });
        });
        return [...seen.values()].sort((a, b) => (a.code || '').localeCompare(b.code || ''));
    }, [data]);

    // SOP dropdown — derived from currently-selected SO's reservations
    const sopOptions = useMemo(() => {
        if (!data?.groups || !salesOrderId) return [];
        const seen = new Map();
        data.groups.forEach(g => {
            (g.variants || []).forEach(v => {
                (v.reservations || []).forEach(r => {
                    if (String(r.sales_order_id) !== String(salesOrderId)) return;
                    if (r.sales_order_product_id != null && !seen.has(r.sales_order_product_id)) {
                        seen.set(r.sales_order_product_id, {
                            id: r.sales_order_product_id,
                            product: r.product_name || `SOP #${r.sales_order_product_id}`,
                            fabric_color: r.fabric_color_name || '',
                        });
                    }
                });
            });
        });
        return [...seen.values()].sort((a, b) => (a.product || '').localeCompare(b.product || ''));
    }, [data, salesOrderId]);

    // --- client-side search filter (over the already-fetched groups) ---
    const filteredGroups = useMemo(() => {
        if (!data?.groups) return [];
        if (!search.trim()) return data.groups;
        const q = search.trim().toLowerCase();
        return data.groups
            .map(g => {
                const trimMatches =
                    (g.trim_item_name || '').toLowerCase().includes(q) ||
                    (g.trim_item_code || '').toLowerCase().includes(q);
                const variants = (g.variants || []).filter(v => {
                    if (trimMatches) return true;
                    return (
                        (v.color_name || '').toLowerCase().includes(q) ||
                        String(v.color_number || '').toLowerCase().includes(q) ||
                        (v.variant_size || '').toLowerCase().includes(q)
                    );
                });
                return variants.length > 0 ? { ...g, variants } : null;
            })
            .filter(Boolean);
    }, [data, search]);

    const toggleTrim = (id) => setExpandedTrims(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
    });
    const toggleVariant = (id) => setExpandedVariants(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
    });

    const handleRelease = async (reservation, variantUom) => {
        const qty = Number(reservation.quantity_reserved || 0);
        const msg = `Release ${fmtNum(qty)} ${variantUom || 'pcs'} reserved for ${reservation.sales_order_code || 'this SO'}?\n\nStock returns to the pool.`;
        if (!window.confirm(msg)) return;
        setReleasingId(reservation.id);
        setRowErrors(prev => { const n = { ...prev }; delete n[reservation.id]; return n; });
        try {
            await planningApi.deleteTrimReservation(reservation.id);
            setToast({ kind: 'success', message: `Released ${fmtNum(qty)} ${variantUom || 'pcs'} · stock returned to pool.` });
            await fetchReservations();
        } catch (e) {
            const err = e?.response?.data?.error || e?.message || 'Release failed.';
            setRowErrors(prev => ({ ...prev, [reservation.id]: err }));
            setToast({ kind: 'error', message: err });
        } finally {
            setReleasingId(null);
        }
    };

    const handleResetFilters = () => {
        setSalesOrderId('');
        setSopId('');
        setSearch('');
    };

    const totals = data?.totals || {};

    return (
        <div className="min-h-screen bg-gray-100 p-6 font-inter text-gray-900">
            <div className="max-w-7xl mx-auto space-y-6">

                {/* Header */}
                <div>
                    <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
                        <Bookmark className="text-emerald-600" /> Trim Reservations
                    </h1>
                    <p className="text-sm text-slate-500 mt-1">
                        Everything you've reserved across active sales orders. Drill into a trim → variant → individual reservation.
                    </p>
                </div>

                {/* KPI strip */}
                {loading && !data ? (
                    <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin text-emerald-600" /></div>
                ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                        <KpiCard label="Trim items"    value={fmtNum(totals.trim_item_count)}
                            icon={Package}       colorClass="text-indigo-700"  bgClass="bg-indigo-50" />
                        <KpiCard label="Variants"      value={fmtNum(totals.variant_count)}
                            icon={Layers}        colorClass="text-slate-700"   bgClass="bg-slate-100" />
                        <KpiCard label="Reservations"  value={fmtNum(totals.reservation_count)}
                            icon={Bookmark}      colorClass="text-emerald-700" bgClass="bg-emerald-50" />
                        <KpiCard label="Total units"   value={fmtNum(totals.total_units_reserved)}
                            icon={Boxes}         colorClass="text-slate-700"   bgClass="bg-slate-100" />
                        <KpiCard label="SOs covered"   value={fmtNum(totals.sales_orders_covered)}
                            icon={ClipboardList} colorClass="text-amber-700"   bgClass="bg-amber-50" />
                    </div>
                )}

                {/* Filter bar */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-3 flex flex-wrap items-center gap-3">
                    <div className="relative flex-1 min-w-[220px]">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Search by trim, code, color, or color #…"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="w-full text-sm border border-slate-200 rounded-lg pl-9 pr-3 py-2 focus:outline-none focus:border-emerald-400"
                        />
                    </div>
                    <div className="flex items-center gap-1.5">
                        <Filter size={13} className="text-slate-400" />
                        <select
                            value={salesOrderId}
                            onChange={e => { setSalesOrderId(e.target.value); setSopId(''); }}
                            className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:border-emerald-400"
                        >
                            <option value="">All Sales Orders</option>
                            {salesOrderOptions.map(o => (
                                <option key={o.id} value={o.id}>
                                    {o.code}{o.customer ? ` · ${o.customer}` : ''}
                                </option>
                            ))}
                        </select>
                        <select
                            value={sopId}
                            onChange={e => setSopId(e.target.value)}
                            disabled={!salesOrderId}
                            className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:border-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed"
                            title={!salesOrderId ? 'Pick a sales order first' : 'Filter to one product within the SO'}
                        >
                            <option value="">All Products</option>
                            {sopOptions.map(o => (
                                <option key={o.id} value={o.id}>
                                    {o.product}{o.fabric_color ? ` · ${o.fabric_color}` : ''}
                                </option>
                            ))}
                        </select>
                    </div>
                    {(salesOrderId || sopId || search) && (
                        <button
                            type="button"
                            onClick={handleResetFilters}
                            className="flex items-center gap-1 text-xs font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-100 px-2 py-1.5 rounded-md transition-colors"
                        >
                            <RotateCw size={12} /> Reset
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={fetchReservations}
                        disabled={loading}
                        className="text-xs font-bold text-emerald-700 hover:text-white hover:bg-emerald-600 border border-emerald-200 hover:border-emerald-600 px-2 py-1.5 rounded-md transition-colors disabled:opacity-40 ml-auto"
                        title="Refresh"
                    >
                        {loading ? <Loader2 size={12} className="animate-spin inline" /> : 'Refresh'}
                    </button>
                </div>

                {/* Body — list */}
                {error && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 flex items-center gap-2">
                        <AlertTriangle size={14} /> {error}
                    </div>
                )}

                {loading && data && (
                    <div className="flex items-center justify-center gap-2 text-sm text-slate-500">
                        <Loader2 className="w-4 h-4 animate-spin" /> Refreshing…
                    </div>
                )}

                {!loading && filteredGroups.length === 0 && (
                    <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-sm text-slate-400 italic">
                        {search || salesOrderId || sopId
                            ? 'No reservations match your filters.'
                            : 'No trim reservations on file. Reserve via the merchandiser planning page to see them here.'}
                    </div>
                )}

                {filteredGroups.map(group => {
                    const trimExpanded = expandedTrims.has(group.trim_item_id);
                    return (
                        <div key={group.trim_item_id} className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                            {/* Trim header */}
                            <button
                                type="button"
                                onClick={() => toggleTrim(group.trim_item_id)}
                                className={`w-full flex items-center gap-3 px-5 py-4 cursor-pointer hover:bg-slate-50 transition-colors text-left ${trimExpanded ? 'border-b border-slate-100 bg-slate-50/50' : ''}`}
                            >
                                {trimExpanded
                                    ? <ChevronDown size={18} className="text-slate-400 shrink-0" />
                                    : <ChevronRight size={18} className="text-slate-400 shrink-0" />}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <Package size={16} className="text-indigo-500 shrink-0" />
                                        <span className="font-bold text-base text-slate-800 truncate">{group.trim_item_name || `Trim #${group.trim_item_id}`}</span>
                                        {group.trim_item_code && (
                                            <span className="text-xs font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">{group.trim_item_code}</span>
                                        )}
                                    </div>
                                    <div className="text-xs text-slate-500 mt-1 flex items-center gap-2 flex-wrap">
                                        <span className="font-bold text-emerald-700">{fmtNum(group.total_reserved)} {group.uom || 'pcs'}</span>
                                        <span>·</span>
                                        <span>{(group.variants || []).length} variant{(group.variants || []).length === 1 ? '' : 's'}</span>
                                    </div>
                                </div>
                            </button>

                            {trimExpanded && (
                                <div className="divide-y divide-slate-100">
                                    {(group.variants || []).map(variant => {
                                        const vExpanded = expandedVariants.has(variant.trim_item_variant_id);
                                        const inStock = Number(variant.in_stock ?? 0);
                                        const stockShort = variant.in_stock != null && inStock < Number(variant.total_reserved || 0);
                                        return (
                                            <div key={variant.trim_item_variant_id}>
                                                <button
                                                    type="button"
                                                    onClick={() => toggleVariant(variant.trim_item_variant_id)}
                                                    className={`w-full flex items-center gap-3 px-5 py-3 cursor-pointer hover:bg-slate-50/70 transition-colors text-left ${vExpanded ? 'bg-slate-50/40' : ''}`}
                                                >
                                                    {vExpanded
                                                        ? <ChevronDown size={14} className="text-slate-400 shrink-0 ml-4" />
                                                        : <ChevronRight size={14} className="text-slate-400 shrink-0 ml-4" />}
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            <Layers size={13} className="text-slate-400 shrink-0" />
                                                            <span className="text-sm font-bold text-slate-800 truncate">
                                                                {variant.color_name || '—'}
                                                            </span>
                                                            {variant.color_number && (
                                                                <span className="text-[11px] font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">#{variant.color_number}</span>
                                                            )}
                                                            {variant.variant_size && (
                                                                <span className="text-[11px] font-bold text-slate-600 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded">Sz {variant.variant_size}</span>
                                                            )}
                                                        </div>
                                                        <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-2 flex-wrap">
                                                            <span className="font-bold text-emerald-700">{fmtNum(variant.total_reserved)} reserved</span>
                                                            {variant.in_stock != null && (
                                                                <>
                                                                    <span>·</span>
                                                                    <span className={stockShort ? 'text-red-600 font-bold' : 'text-slate-600'}>
                                                                        {fmtNum(variant.in_stock)} in stock
                                                                    </span>
                                                                </>
                                                            )}
                                                            <span>·</span>
                                                            <span>{(variant.reservations || []).length} reservation{(variant.reservations || []).length === 1 ? '' : 's'}</span>
                                                        </div>
                                                    </div>
                                                </button>

                                                {vExpanded && (variant.reservations || []).length > 0 && (
                                                    <div className="pl-10 pr-5 pb-3 pt-1 space-y-1.5">
                                                        {variant.reservations.map(r => {
                                                            const rowErr = rowErrors[r.id];
                                                            const releasing = releasingId === r.id;
                                                            return (
                                                                <div key={r.id} className="flex items-start gap-3 bg-white border border-slate-100 rounded-lg px-3 py-2 text-xs">
                                                                    <div className="flex-1 min-w-0">
                                                                        <div className="flex items-center gap-2 flex-wrap">
                                                                            <span className="font-bold text-slate-800">{r.sales_order_code || `SO #${r.sales_order_id}`}</span>
                                                                            {r.customer_name && (
                                                                                <span className="text-slate-400">· {r.customer_name}</span>
                                                                            )}
                                                                            {r.is_substitute && (
                                                                                <span className="text-[10px] font-bold uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded">substitute</span>
                                                                            )}
                                                                        </div>
                                                                        <div className="text-slate-600 mt-0.5">
                                                                            {r.product_name || `SOP #${r.sales_order_product_id}`}
                                                                            {r.fabric_color_name && <span className="text-slate-400"> · {r.fabric_color_name}{r.fabric_color_number ? ` (${r.fabric_color_number})` : ''}</span>}
                                                                        </div>
                                                                        <div className="text-[11px] text-slate-400 mt-0.5">
                                                                            reserved {fmtDateTime(r.reserved_at)}
                                                                            {r.reserved_by_name && <> · by {r.reserved_by_name}</>}
                                                                        </div>
                                                                        {rowErr && (
                                                                            <div className="text-[11px] text-red-600 mt-1 flex items-center gap-1">
                                                                                <AlertTriangle size={10} /> {rowErr}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                    <div className="text-right shrink-0">
                                                                        <p className="text-sm font-bold text-emerald-700 tabular-nums">{fmtNum(r.quantity_reserved)} {group.uom || 'pcs'}</p>
                                                                    </div>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleRelease(r, group.uom)}
                                                                        disabled={releasing}
                                                                        className="shrink-0 flex items-center gap-1 text-[11px] font-bold text-red-600 hover:text-white hover:bg-red-600 border border-red-200 hover:border-red-600 px-2 py-1 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                                                        title="Release this reservation"
                                                                    >
                                                                        {releasing
                                                                            ? <Loader2 size={11} className="animate-spin" />
                                                                            : <Trash2 size={11} />}
                                                                        Release
                                                                    </button>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                                {vExpanded && (variant.reservations || []).length === 0 && (
                                                    <div className="pl-10 pr-5 pb-3 text-[11px] text-slate-400 italic">
                                                        No reservations on this variant.
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            <Toast kind={toast?.kind} message={toast?.message} onDismiss={() => setToast(null)} />
        </div>
    );
};

export default TrimReservationsPage;

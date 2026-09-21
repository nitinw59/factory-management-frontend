// src/modules/production/ProductionWorkflowTableView.jsx
//
// Excel-like alternative to the workflow graph: one row per production batch
// (same batchRowsOf shape the Excel export uses — a SOP with no batches yet
// still gets a placeholder row so pending order lines aren't silently
// dropped), one column per variable. The header is frozen (sticky top + a
// frozen first column, like Excel's "Freeze Panes"); each column has its own
// filter, opened on demand via the small funnel icon in its header (a text
// box, a checkbox value-list for the two status columns, or a min/max range
// for numeric/date columns) rather than a permanently-visible filter row.
// A "Columns" panel (top-left, above the table) lets a user drag to reorder
// columns and check/uncheck which ones are shown — both remembered in
// localStorage per browser, same convention as ScoreboardPage.jsx's saved
// view prefs.
//
// Data is fetched via the same gatherProductionWorkflowBatchData() the Excel
// exporter uses, so the numbers here always match the download.
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, ArrowUp, ArrowDown, ArrowUpDown, Filter, SlidersHorizontal, GripVertical, X } from 'lucide-react';
import { gatherProductionWorkflowBatchData } from './productionWorkflowExcelExport';

const STORAGE_KEY = 'pwf_table_columns_v1';

// Column width BUDGET, keyed by type — not a hard cap. table-layout stays
// "auto" (the browser default), so a column still grows past this if its
// actual data is wider (e.g. a long customer name); this only stops a long
// header LABEL from inflating a column whose data is short (numbers, dates),
// which is what forced every column wide before the header could wrap.
const HEADER_WIDTH = { text: 110, select: 92, number: 74, date: 88 };

const fmtDate     = (d) => d ? d.toLocaleDateString('en', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
const fmtNum      = (n) => n == null ? '—' : Number(n).toLocaleString();
const statusLabel = (s) => s ? String(s).replace(/_/g, ' ') : '—';

function buildColumns(stageNames) {
    const today = new Date();
    const cols = [
        { key: 'so_number',      label: 'Sales Order',               type: 'text',   get: e => e.so.order_number || null },
        { key: 'so_status',      label: 'SO Status',                 type: 'select', get: e => statusLabel(e.so.so_status) },
        { key: 'customer',       label: 'Customer',                  type: 'text',   get: e => e.so.customer_name || null },
        { key: 'product',        label: 'Product',                   type: 'text',   get: e => e.batch?.product_name || e.sop?.product_name || null },
        { key: 'fabric_type',    label: 'Fabric Type',                type: 'text',   get: e => e.sop?.fabric_type || null },
        { key: 'order_qty',      label: 'Order Qty (Total Pieces)',  type: 'number', align: 'right', get: e => e.sop?.total_quantity ?? null },
        { key: 'buyer_po',       label: 'Buyer PO',                  type: 'text',   get: e => e.so.buyer_po_number || null },
        { key: 'order_date',     label: 'Order Date',                type: 'date',   get: e => e.so.order_date ? new Date(e.so.order_date) : null },
        { key: 'delivery_date',  label: 'Delivery Date',             type: 'date',   get: e => e.so.delivery_date ? new Date(e.so.delivery_date) : null },
        { key: 'order_value',    label: 'Order Value',               type: 'number', align: 'right', get: e => e.so.total_amount != null ? Number(e.so.total_amount) : null },
        { key: 'batch_id',       label: 'Batch ID',                  type: 'text',   get: e => e.batch ? String(e.batch.batch_id) : null },
        { key: 'batch_created',  label: 'Batch Created',             type: 'date',   get: e => e.batch?.created_at ? new Date(e.batch.created_at) : null },
        { key: 'rolls',          label: 'Total Rolls Assigned',      type: 'number', align: 'right', get: e => e.batch ? (e.totals.roll_count ?? 0) : null },
        { key: 'fabric_assigned',label: 'Total Fabric Assigned (m)', type: 'number', align: 'right', get: e => e.batch ? (e.totals.fabric_meters_assigned ?? 0) : null },
    ];

    stageNames.forEach((name, idx) => {
        cols.push({
            key: `stage_${idx}`, label: name, type: 'number', align: 'right',
            get: e => {
                if (!e.batch) return null;
                const stage = (e.batch.stage_pipeline || []).find(s => s.line_type_name === name);
                if (!stage) return null;
                const qty = e.stageQty.get(String(stage.flow_id));
                return qty?.done ?? null;
            },
        });
    });

    cols.push(
        { key: 'cut_pieces',  label: 'Batch Cut Pieces',        type: 'number', align: 'right', get: e => e.batch ? (e.totals.cut_pieces ?? 0) : null },
        { key: 'dispatched',  label: 'Total Dispatched (pcs)',  type: 'number', align: 'right', get: e => e.batch ? (e.totals.pieces_dispatched ?? 0) : null },
        { key: 'pending',     label: 'Pending / Balance (pcs)', type: 'number', align: 'right', get: e => e.batch ? Math.max((e.totals.cut_pieces ?? 0) - (e.totals.pieces_dispatched ?? 0), 0) : null },
        { key: 'batch_status',label: 'Batch Status',            type: 'select', get: e => e.batch ? statusLabel(e.batch.overall_status) : 'PRE PRODUCTION' },
        { key: 'days_since',  label: 'Days Since Order',        type: 'number', align: 'right', get: e => e.so.order_date ? Math.round((today - new Date(e.so.order_date)) / 86400000) : null },
    );

    return cols;
}

// Select-type filters store the EXCLUDED values (unchecked boxes) — an empty/
// absent set means "everything shown", matching a fresh Excel filter dropdown
// where every box starts checked.
function passesFilter(raw, type, filterVal) {
    if (type === 'text') {
        if (!filterVal) return true;
        return String(raw ?? '').toLowerCase().includes(String(filterVal).toLowerCase());
    }
    if (type === 'select') {
        if (!filterVal || filterVal.size === 0) return true;
        return !filterVal.has(String(raw ?? ''));
    }
    const { min, max } = filterVal || {};
    if (min == null && max == null) return true;
    if (raw == null) return false;
    const rawVal = type === 'date' ? raw.getTime() : raw;
    if (min != null) {
        const minVal = type === 'date' ? new Date(min).getTime() : Number(min);
        if (!Number.isNaN(minVal) && rawVal < minVal) return false;
    }
    if (max != null) {
        const maxVal = type === 'date' ? new Date(max).getTime() : Number(max);
        if (!Number.isNaN(maxVal) && rawVal > maxVal) return false;
    }
    return true;
}

function isFilterActive(col, filterVal) {
    if (filterVal == null) return false;
    if (col.type === 'text') return filterVal !== '';
    if (col.type === 'select') return filterVal.size > 0;
    return filterVal.min != null || filterVal.max != null;
}

function compareValues(a, b) {
    if (a == null && b == null) return 0;
    if (a == null) return 1;
    if (b == null) return -1;
    if (a instanceof Date) return a - b;
    if (typeof a === 'number') return a - b;
    return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

function loadColumnPrefs() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw);
        return { order: parsed.order || [], hidden: parsed.hidden || [] };
    } catch { return null; }
}

const SortIcon = ({ active, dir }) => {
    if (!active) return <ArrowUpDown size={11} className="text-slate-300" />;
    return dir === 1 ? <ArrowUp size={11} className="text-indigo-600" /> : <ArrowDown size={11} className="text-indigo-600" />;
};

// Fixed-position popover anchored under a trigger button, escaping any
// scroll-clipping ancestor via a body portal. Closes on outside click.
const Popover = ({ anchorEl, onClose, width = 240, align = 'left', children }) => {
    const ref = useRef(null);
    const [pos, setPos] = useState(null);

    useEffect(() => {
        if (!anchorEl) return;
        const r = anchorEl.getBoundingClientRect();
        const left = align === 'right'
            ? Math.max(8, Math.min(r.right - width, window.innerWidth - width - 8))
            : Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
        setPos({ top: r.bottom + 6, left });
    }, [anchorEl, align, width]);

    useEffect(() => {
        const onDown = (e) => {
            if (ref.current && !ref.current.contains(e.target) && anchorEl && !anchorEl.contains(e.target)) onClose();
        };
        document.addEventListener('mousedown', onDown);
        return () => document.removeEventListener('mousedown', onDown);
    }, [anchorEl, onClose]);

    if (!pos) return null;
    return createPortal(
        <div
            ref={ref}
            style={{ position: 'fixed', top: pos.top, left: pos.left, width, zIndex: 1000 }}
            className="bg-white rounded-xl shadow-2xl border border-slate-200 p-3"
        >
            {children}
        </div>,
        document.body
    );
};

const FilterPopoverBody = ({ col, filterVal, options, onChange, onClear }) => {
    if (col.type === 'text') {
        return (
            <div>
                <input
                    autoFocus
                    type="text"
                    value={filterVal || ''}
                    onChange={e => onChange(e.target.value)}
                    placeholder={`Filter ${col.label}…`}
                    className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-indigo-400"
                />
                <button onClick={onClear} className="mt-2 text-[11px] text-slate-400 hover:text-red-500">Clear filter</button>
            </div>
        );
    }

    if (col.type === 'select') {
        const excluded = filterVal || new Set();
        const allChecked = options.length > 0 && options.every(o => !excluded.has(o));
        return (
            <div>
                <label className="flex items-center gap-2 text-[11px] font-bold text-slate-600 pb-1.5 mb-1.5 border-b border-slate-100 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={allChecked}
                        onChange={() => onChange(allChecked ? new Set(options) : new Set())}
                    />
                    (Select All)
                </label>
                <div className="max-h-48 overflow-y-auto space-y-1 pr-1">
                    {options.map(opt => (
                        <label key={opt} className="flex items-center gap-2 text-[11px] text-slate-700 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={!excluded.has(opt)}
                                onChange={() => {
                                    const next = new Set(excluded);
                                    if (next.has(opt)) next.delete(opt); else next.add(opt);
                                    onChange(next);
                                }}
                            />
                            {opt}
                        </label>
                    ))}
                </div>
                <button onClick={onClear} className="mt-2 text-[11px] text-slate-400 hover:text-red-500">Clear filter</button>
            </div>
        );
    }

    // number | date range
    const isDate = col.type === 'date';
    const val = filterVal || {};
    return (
        <div className="space-y-2">
            <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase">Min</label>
                <input
                    type={isDate ? 'date' : 'number'}
                    value={(isDate ? val.min : val.min) ?? ''}
                    onChange={e => onChange({ ...val, min: e.target.value || null })}
                    className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 mt-0.5 focus:outline-none focus:border-indigo-400"
                />
            </div>
            <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase">Max</label>
                <input
                    type={isDate ? 'date' : 'number'}
                    value={(isDate ? val.max : val.max) ?? ''}
                    onChange={e => onChange({ ...val, max: e.target.value || null })}
                    className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 mt-0.5 focus:outline-none focus:border-indigo-400"
                />
            </div>
            <button onClick={onClear} className="text-[11px] text-slate-400 hover:text-red-500">Clear filter</button>
        </div>
    );
};

const ProductionWorkflowTableView = ({ salesOrders, onSOClick, onBatchClick }) => {
    const [loading, setLoading]       = useState(true);
    const [loadError, setLoadError]   = useState(null);
    const [entries, setEntries]       = useState([]);
    const [stageNames, setStageNames] = useState([]);
    const [filters, setFilters]       = useState({});
    const [sort, setSort]             = useState({ key: null, dir: 1 });

    const [columnOrder, setColumnOrder] = useState([]);
    const [hiddenKeys, setHiddenKeys]   = useState(new Set());
    const [dragKey, setDragKey]         = useState(null);

    const [openFilterKey, setOpenFilterKey]         = useState(null);
    const [columnSettingsOpen, setColumnSettingsOpen] = useState(false);
    const [selectedCell, setSelectedCell]           = useState(null); // { rowKey, colKey } — last clicked cell/row
    const filterBtnRefs   = useRef({});
    const settingsBtnRef  = useRef(null);
    const scrollRef        = useRef(null);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setLoadError(null);
        gatherProductionWorkflowBatchData(salesOrders)
            .then(({ entries: e, stageNames: s }) => {
                if (cancelled) return;
                setEntries(e);
                setStageNames(s);
            })
            .catch((err) => {
                console.error('Failed to load workflow table data', err);
                if (!cancelled) setLoadError('Failed to load table data. Please try again.');
            })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [salesOrders]);

    const columns = useMemo(() => buildColumns(stageNames), [stageNames]);

    // Reconcile saved column order/visibility against the current column set
    // (the stage columns are data-dependent, so they can differ session to
    // session) — anything newly seen is appended at the end in its default
    // position, anything no longer present is dropped silently.
    useEffect(() => {
        const allKeys = columns.map(c => c.key);
        const prefs = loadColumnPrefs();
        const order = (prefs?.order || []).filter(k => allKeys.includes(k));
        allKeys.forEach(k => { if (!order.includes(k)) order.push(k); });
        setColumnOrder(order);
        setHiddenKeys(new Set((prefs?.hidden || []).filter(k => allKeys.includes(k))));
    }, [columns]);

    useEffect(() => {
        if (columnOrder.length === 0) return;
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ order: columnOrder, hidden: [...hiddenKeys] }));
    }, [columnOrder, hiddenKeys]);

    // Close any open popover if the table scrolls under it — its anchor
    // position is captured at open time and would otherwise go stale.
    useEffect(() => {
        if (!openFilterKey && !columnSettingsOpen) return;
        const el = scrollRef.current;
        if (!el) return;
        const close = () => { setOpenFilterKey(null); setColumnSettingsOpen(false); };
        el.addEventListener('scroll', close, { passive: true });
        window.addEventListener('resize', close);
        return () => { el.removeEventListener('scroll', close); window.removeEventListener('resize', close); };
    }, [openFilterKey, columnSettingsOpen]);

    const orderedColumns = useMemo(() => {
        const byKey = new Map(columns.map(c => [c.key, c]));
        return columnOrder.map(k => byKey.get(k)).filter(Boolean);
    }, [columns, columnOrder]);

    const visibleColumns = useMemo(
        () => orderedColumns.filter(c => !hiddenKeys.has(c.key)),
        [orderedColumns, hiddenKeys]
    );

    const selectOptions = useMemo(() => {
        const map = {};
        columns.forEach(col => {
            if (col.type !== 'select') return;
            const set = new Set();
            entries.forEach(e => { const v = col.get(e); if (v != null) set.add(String(v)); });
            map[col.key] = [...set].sort();
        });
        return map;
    }, [entries, columns]);

    const filteredEntries = useMemo(() => {
        let list = entries;
        for (const col of columns) {
            const f = filters[col.key];
            if (!isFilterActive(col, f)) continue;
            list = list.filter(e => passesFilter(col.get(e), col.type, f));
        }
        return list;
    }, [entries, filters, columns]);

    const sortedEntries = useMemo(() => {
        if (!sort.key) return filteredEntries;
        const col = columns.find(c => c.key === sort.key);
        if (!col) return filteredEntries;
        return [...filteredEntries].sort((a, b) => sort.dir * compareValues(col.get(a), col.get(b)));
    }, [filteredEntries, sort, columns]);

    const handleSort = (key) => {
        setSort(s => {
            if (s.key !== key) return { key, dir: 1 };
            if (s.dir === 1) return { key, dir: -1 };
            return { key: null, dir: 1 };
        });
    };

    const setFilter    = useCallback((key, value) => setFilters(f => ({ ...f, [key]: value })), []);
    const clearFilter  = useCallback((key) => setFilters(f => { const next = { ...f }; delete next[key]; return next; }), []);
    const activeFilterCount = columns.filter(c => isFilterActive(c, filters[c.key])).length;

    const toggleHidden = (key) => setHiddenKeys(h => {
        const next = new Set(h);
        if (next.has(key)) next.delete(key); else next.add(key);
        return next;
    });
    const resetColumns = () => { setColumnOrder(columns.map(c => c.key)); setHiddenKeys(new Set()); };

    const handleDragOver = (e, overKey) => {
        e.preventDefault();
        if (!dragKey || dragKey === overKey) return;
        setColumnOrder(order => {
            const next = [...order];
            const from = next.indexOf(dragKey);
            const to = next.indexOf(overKey);
            if (from === -1 || to === -1) return order;
            next.splice(from, 1);
            next.splice(to, 0, dragKey);
            return next;
        });
    };

    if (loading) {
        return (
            <div className="h-64 flex flex-col items-center justify-center gap-2 text-slate-400">
                <Loader2 className="animate-spin" size={28} />
                <p className="text-xs font-medium">Loading batch-level data…</p>
            </div>
        );
    }

    if (loadError) {
        return <div className="p-8 text-center text-sm text-red-500">{loadError}</div>;
    }

    const openFilterCol = columns.find(c => c.key === openFilterKey);

    return (
        <div className="space-y-2">
            <div className="flex items-center gap-3 text-xs text-slate-700">
                <button
                    ref={settingsBtnRef}
                    onClick={() => { setColumnSettingsOpen(o => !o); setOpenFilterKey(null); }}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg font-bold border transition-colors ${columnSettingsOpen ? 'bg-indigo-50 border-indigo-200 text-indigo-600' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                    title="Show/hide and reorder columns"
                >
                    <SlidersHorizontal size={12} /> Columns
                </button>

                <span className="tabular-nums">{sortedEntries.length} of {entries.length} batch row{entries.length !== 1 ? 's' : ''}</span>

                {activeFilterCount > 0 && (
                    <button
                        onClick={() => setFilters({})}
                        className="flex items-center gap-1 text-indigo-600 hover:text-indigo-800 font-bold"
                    >
                        <X size={11} /> Clear {activeFilterCount} filter{activeFilterCount !== 1 ? 's' : ''}
                    </button>
                )}
            </div>

            <div ref={scrollRef} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-auto max-h-[calc(100vh-220px)]">
                <table className="border-collapse text-xs w-full">
                    <thead>
                        <tr className="bg-slate-50 border-b border-slate-200">
                            {visibleColumns.map((col, i) => {
                                const active = isFilterActive(col, filters[col.key]);
                                return (
                                    <th
                                        key={col.key}
                                        className={`sticky top-0 bg-slate-50 px-1.5 py-1.5 text-left align-top ${i === 0 ? 'left-0 z-30 shadow-[1px_0_0_0_#e2e8f0]' : 'z-20'}`}
                                        style={{ width: HEADER_WIDTH[col.type] }}
                                    >
                                        <div className="flex items-start justify-between gap-0.5">
                                            <button
                                                onClick={() => handleSort(col.key)}
                                                className="flex items-center gap-0.5 min-w-0 text-left hover:text-indigo-600 transition-colors group"
                                            >
                                                <span className="line-clamp-2 font-bold text-slate-700 group-hover:text-indigo-600 uppercase tracking-wide text-[9px] leading-[1.15]">
                                                    {col.label}
                                                </span>
                                                <SortIcon active={sort.key === col.key} dir={sort.dir} />
                                            </button>
                                            <button
                                                ref={el => { filterBtnRefs.current[col.key] = el; }}
                                                onClick={() => { setOpenFilterKey(k => k === col.key ? null : col.key); setColumnSettingsOpen(false); }}
                                                className={`shrink-0 p-0.5 rounded transition-colors ${active ? 'text-indigo-600' : 'text-slate-300 hover:text-slate-500'}`}
                                                title={`Filter ${col.label}`}
                                            >
                                                <Filter size={10} fill={active ? 'currentColor' : 'none'} />
                                            </button>
                                        </div>
                                    </th>
                                );
                            })}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {sortedEntries.length === 0 ? (
                            <tr>
                                <td colSpan={visibleColumns.length} className="px-6 py-16 text-center text-slate-400 italic">
                                    No batch rows match the current filters.
                                </td>
                            </tr>
                        ) : sortedEntries.map((entry, idx) => {
                            const rowKey = `${entry.batch?.batch_id ?? 'nb'}-${entry.so.sales_order_id ?? 'nso'}-${idx}`;
                            const isRowSelected = selectedCell?.rowKey === rowKey;
                            return (
                                <tr key={rowKey} className={`group ${isRowSelected ? 'bg-indigo-50' : 'hover:bg-slate-50'}`}>
                                    {visibleColumns.map((col, ci) => {
                                        const raw = col.get(entry);
                                        let display;
                                        if (raw == null) display = '—';
                                        else if (col.type === 'number') display = fmtNum(raw);
                                        else if (col.type === 'date') display = fmtDate(raw);
                                        else display = String(raw);

                                        const isCellSelected = isRowSelected && selectedCell?.colKey === col.key;
                                        const stickyBg = ci === 0 ? (isRowSelected ? 'bg-indigo-50' : 'bg-white group-hover:bg-slate-50') : '';
                                        const baseCls = `px-3 py-2 whitespace-nowrap cursor-pointer ${col.align === 'right' ? 'text-right tabular-nums' : ''} ${ci === 0 ? `sticky left-0 z-10 shadow-[1px_0_0_0_#e2e8f0] ${stickyBg}` : ''} ${isCellSelected ? 'outline outline-2 -outline-offset-2 outline-indigo-500' : ''}`;
                                        const select = () => setSelectedCell({ rowKey, colKey: col.key });

                                        if (col.key === 'so_number' && raw != null) {
                                            return (
                                                <td key={col.key} className={baseCls} onClick={select}>
                                                    <button onClick={() => onSOClick?.(entry.so)} className="font-mono font-bold text-indigo-600 hover:underline">
                                                        {display}
                                                    </button>
                                                </td>
                                            );
                                        }
                                        if (col.key === 'batch_id' && raw != null) {
                                            return (
                                                <td key={col.key} className={baseCls} onClick={select}>
                                                    <button onClick={() => onBatchClick?.(entry.batch.batch_id, entry.batch.batch_code)} className="font-mono font-bold text-emerald-600 hover:underline">
                                                        {display}
                                                    </button>
                                                </td>
                                            );
                                        }
                                        if (col.key === 'fabric_assigned') {
                                            const endbit = entry.batch ? Number(entry.totals.fabric_meters_same_so_endbit) || 0 : 0;
                                            return (
                                                <td key={col.key} className={`${baseCls} text-slate-800`} onClick={select}>
                                                    {display}
                                                    {endbit > 0 && (
                                                        <span className="block text-[9px] font-semibold text-amber-600 leading-tight">
                                                            ({fmtNum(endbit)} endbit)
                                                        </span>
                                                    )}
                                                </td>
                                            );
                                        }
                                        return (
                                            <td key={col.key} className={`${baseCls} ${ci === 0 ? 'text-slate-900 font-medium' : 'text-slate-800'}`} onClick={select}>
                                                {display}
                                            </td>
                                        );
                                    })}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {openFilterCol && (
                <Popover anchorEl={filterBtnRefs.current[openFilterCol.key]} onClose={() => setOpenFilterKey(null)}>
                    <FilterPopoverBody
                        col={openFilterCol}
                        filterVal={filters[openFilterCol.key]}
                        options={selectOptions[openFilterCol.key] || []}
                        onChange={v => setFilter(openFilterCol.key, v)}
                        onClear={() => clearFilter(openFilterCol.key)}
                    />
                </Popover>
            )}

            {columnSettingsOpen && (
                <Popover anchorEl={settingsBtnRef.current} onClose={() => setColumnSettingsOpen(false)} width={260}>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Drag to reorder · check to show</p>
                    <div className="max-h-80 overflow-y-auto space-y-0.5 pr-1">
                        {orderedColumns.map(col => (
                            <div
                                key={col.key}
                                draggable
                                onDragStart={() => setDragKey(col.key)}
                                onDragOver={e => handleDragOver(e, col.key)}
                                onDragEnd={() => setDragKey(null)}
                                className={`flex items-center gap-2 px-1.5 py-1 rounded-lg text-xs cursor-move select-none ${dragKey === col.key ? 'bg-indigo-50' : 'hover:bg-slate-50'}`}
                            >
                                <GripVertical size={12} className="text-slate-300 shrink-0" />
                                <input
                                    type="checkbox"
                                    checked={!hiddenKeys.has(col.key)}
                                    onChange={() => toggleHidden(col.key)}
                                />
                                <span className="flex-1 truncate text-slate-700">{col.label}</span>
                            </div>
                        ))}
                    </div>
                    <div className="flex items-center justify-between pt-2 mt-2 border-t border-slate-100">
                        <button onClick={resetColumns} className="text-[11px] text-slate-400 hover:text-slate-600">Reset</button>
                        <span className="text-[10px] text-slate-400">{visibleColumns.length}/{orderedColumns.length} shown</span>
                    </div>
                </Popover>
            )}
        </div>
    );
};

export default ProductionWorkflowTableView;

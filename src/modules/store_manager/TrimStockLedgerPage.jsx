import React, { useState, useEffect, useCallback, useRef } from 'react';
import { LuSearch, LuChevronDown, LuChevronRight, LuRefreshCw, LuChevronLeft, LuPackage } from 'react-icons/lu';
import { Loader2 } from 'lucide-react';
import { trimsApi } from '../../api/trimsApi';

console.log('[TrimStockLedger] MODULE LOADED — trimsApi:', trimsApi);

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SOURCE_KIND_META = {
  inward_create:           { label: 'Inward Received',       color: 'emerald' },
  inward_update_reverse:   { label: 'Inward Corrected (−)',  color: 'orange'  },
  inward_update_apply:     { label: 'Inward Corrected (+)',  color: 'teal'    },
  inward_delete:           { label: 'Inward Deleted',        color: 'red'     },
  manual:                  { label: 'Manual Adjustment',     color: 'blue'    },
  reservation_create:      { label: 'Reserved',              color: 'purple'  },
  reservation_update:      { label: 'Reservation Updated',   color: 'purple'  },
  reservation_release:     { label: 'Reservation Released',  color: 'gray'    },
  bill_item_create:        { label: 'Invoice Raised',        color: 'amber'   },
  bill_item_delete:        { label: 'Invoice Reversed',      color: 'amber'   },
  fulfill_with_variant:    { label: 'Fulfillment',           color: 'indigo'  },
  fulfill_revert:          { label: 'Fulfillment Reverted',  color: 'indigo'  },
  auto_fulfill_exact:      { label: 'Auto Fulfill',          color: 'indigo'  },
  auto_fulfill_substitute: { label: 'Auto Fulfill (Sub)',    color: 'violet'  },
};

const COLOR_CLASSES = {
  emerald: 'bg-emerald-100 text-emerald-700',
  orange:  'bg-orange-100 text-orange-700',
  teal:    'bg-teal-100 text-teal-700',
  red:     'bg-red-100 text-red-700',
  blue:    'bg-blue-100 text-blue-700',
  purple:  'bg-purple-100 text-purple-700',
  gray:    'bg-gray-100 text-gray-600',
  amber:   'bg-amber-100 text-amber-700',
  indigo:  'bg-indigo-100 text-indigo-700',
  violet:  'bg-violet-100 text-violet-700',
};

const LIMIT_OPTIONS = [50, 100, 250, 500];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDateTime(raw) {
  if (!raw) return '—';
  const d = new Date(raw);
  if (isNaN(d)) return raw;
  const dd = String(d.getDate()).padStart(2, '0');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const mm = months[d.getMonth()];
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${dd} ${mm} ${yyyy}, ${hh}:${min}`;
}

function formatNumber(n) {
  if (n === null || n === undefined) return '—';
  return Number(n).toLocaleString('en-IN');
}

function formatDelta(delta) {
  const n = Number(delta);
  if (isNaN(n)) return { text: '—', cls: 'text-gray-400' };
  if (n > 0)  return { text: `+${n.toLocaleString('en-IN')}`, cls: 'text-emerald-600' };
  if (n < 0)  return { text: `−${Math.abs(n).toLocaleString('en-IN')}`, cls: 'text-red-500' };
  return { text: '0', cls: 'text-gray-400' };
}

function formatCurrency(v) {
  if (v === null || v === undefined || v === '') return '—';
  return `₹${Number(v).toFixed(2)}`;
}

function truncate(str, n) {
  if (!str) return '—';
  return str.length > n ? str.slice(0, n) + '…' : str;
}

// #8 — Reference priority is now event-type-aware
function getReference(row) {
  const kind = row.source_kind || '';
  if (kind.startsWith('inward_') && row.grn_number)                                           return row.grn_number;
  if ((kind.startsWith('fulfill') || kind.startsWith('auto_fulfill')) && row.so_number)       return row.so_number;
  if ((kind.startsWith('reservation')) && row.so_number)                                       return row.so_number;
  if (kind.startsWith('bill_') && row.bill_number)                                            return row.bill_number;
  // Generic fallback chain
  if (row.grn_number)  return row.grn_number;
  if (row.so_number)   return row.so_number;
  if (row.bill_number) return row.bill_number;
  if (row.batch_code)  return row.batch_code;
  if (row.reference)   return row.reference;
  return '—';
}

// #6 — Only treat a variant as zero-stock when the field is explicitly 0,
// not when it is null/undefined (unknown stock).
function getVariantStock(v) {
  return v.in_stock ?? v.main_store_stock;   // null = unknown
}
function isDefinitelyZero(v) {
  const s = getVariantStock(v);
  return s !== null && s !== undefined && Number(s) === 0;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SourceKindBadge({ sourceKind }) {
  const meta = SOURCE_KIND_META[sourceKind] || { label: sourceKind, color: 'gray' };
  const cls = COLOR_CLASSES[meta.color] || COLOR_CLASSES.gray;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${cls}`}>
      {meta.label}
    </span>
  );
}

function VariantPill({ colorName, colorNumber, variantSize }) {
  const parts = [colorName, colorNumber, variantSize].filter(Boolean);
  if (!parts.length) return null;
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-xs font-mono">
      {parts.join(' · ')}
    </span>
  );
}

function StatChip({ label, value, colorCls }) {
  return (
    <div className="flex flex-col items-center bg-white border border-gray-200 rounded-lg px-4 py-2 min-w-[100px]">
      <span className={`text-lg font-semibold font-mono ${colorCls}`}>{formatNumber(value)}</span>
      <span className="text-xs text-gray-500 mt-0.5">{label}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Left Pane
// ---------------------------------------------------------------------------

function LeftPane({ selectedItemId, selectedVariantId, onSelectItem, onSelectVariant }) {
  const [search, setSearch] = useState('');
  const [items, setItems] = useState([]);
  const [loadingItems, setLoadingItems] = useState(true);
  const [expandedItemId, setExpandedItemId] = useState(null);
  const [variantsByItem, setVariantsByItem] = useState({});
  const [loadingVariants, setLoadingVariants] = useState({});
  const [showZeroStockFor, setShowZeroStockFor] = useState(new Set());

  useEffect(() => {
    console.log('[TrimStockLedger] LEFT PANE MOUNTED — calling trimsApi.getItems()');
    setLoadingItems(true);
    trimsApi.getItems()
      .then(res => {
        const parsed = res.data?.data ?? res.data ?? [];
        console.log('[TrimStockLedger] items — HTTP', res.status);
        console.log('[TrimStockLedger] items — raw res.data', res.data);
        console.log('[TrimStockLedger] items — parsed count', parsed.length);
        if (parsed.length > 0) console.log('[TrimStockLedger] items — first record keys:', Object.keys(parsed[0]), parsed[0]);
        setItems(parsed);
      })
      .catch((err) => {
        console.error('[TrimStockLedger] items — FETCH ERROR', err?.response?.status, err?.response?.data ?? err.message);
        setItems([]);
      })
      .finally(() => setLoadingItems(false));
  }, []);

  const toggleItem = useCallback((item) => {
    const id = item.id;
    if (expandedItemId === id) {
      setExpandedItemId(null);
      return;
    }
    setExpandedItemId(id);
    if (!variantsByItem[id]) {
      setLoadingVariants(prev => ({ ...prev, [id]: true }));
      trimsApi.getVariants(id)
        .then(res => {
          const parsed = res.data?.data ?? res.data ?? [];
          console.log('[TrimStockLedger] variants — HTTP', res.status, '| item', id);
          console.log('[TrimStockLedger] variants — raw res.data', res.data);
          console.log('[TrimStockLedger] variants — parsed count', parsed.length);
          if (parsed.length > 0) console.log('[TrimStockLedger] variants — first record keys:', Object.keys(parsed[0]), parsed[0]);
          setVariantsByItem(prev => ({ ...prev, [id]: parsed }));
        })
        .catch((err) => {
          console.error('[TrimStockLedger] variants — FETCH ERROR item', id, err?.response?.status, err?.response?.data ?? err.message);
          setVariantsByItem(prev => ({ ...prev, [id]: [] }));
        })
        .finally(() => setLoadingVariants(prev => ({ ...prev, [id]: false })));
    }
  }, [expandedItemId, variantsByItem]);

  const filtered = items.filter(it =>
    (it.item_name || it.name || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="w-72 shrink-0 border-r border-gray-200 bg-white flex flex-col h-full">
      {/* Search */}
      <div className="p-3 border-b border-gray-100">
        <div className="relative">
          <LuSearch className="absolute left-2.5 top-2.5 text-gray-400" size={14} />
          <input
            type="text"
            placeholder="Search trim items…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto pane-scroll">
        {loadingItems ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="animate-spin text-blue-500" size={20} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center text-gray-400 text-sm py-10">No items found</div>
        ) : (
          filtered.map(item => {
            const isExpanded      = expandedItemId === item.id;
            const isItemSelected  = selectedItemId === item.id && selectedVariantId === null;
            const variants        = variantsByItem[item.id] || [];
            const loadingV        = loadingVariants[item.id];

            // #7 — IIFE removed; logic computed as plain variables
            const showZero        = showZeroStockFor.has(item.id);
            const zeroCount       = variants.filter(isDefinitelyZero).length;
            const visibleVariants = showZero ? variants : variants.filter(v => !isDefinitelyZero(v));

            return (
              <div key={item.id}>
                {/* Item row */}
                <div
                  className={`flex items-center justify-between px-3 py-2.5 cursor-pointer hover:bg-blue-50 border-b border-gray-100 ${isItemSelected ? 'ring-2 ring-inset ring-blue-400 bg-blue-50' : ''}`}
                  onClick={() => {
                    // #5 — Don't re-fetch if already in item mode for this item
                    const alreadyInItemMode = selectedItemId === item.id && selectedVariantId === null;
                    toggleItem(item);
                    if (!alreadyInItemMode) onSelectItem(item);
                  }}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{item.item_name || item.name}</p>
                    {item.unit_of_measure && (
                      <p className="text-xs text-gray-400">{item.unit_of_measure}</p>
                    )}
                  </div>
                  {isExpanded
                    ? <LuChevronDown size={14} className="text-gray-400 shrink-0 ml-1" />
                    : <LuChevronRight size={14} className="text-gray-400 shrink-0 ml-1" />
                  }
                </div>

                {/* Variants */}
                {isExpanded && (
                  <div className="bg-gray-50 border-b border-gray-100">
                    {loadingV ? (
                      <div className="flex items-center justify-center py-3">
                        <Loader2 className="animate-spin text-blue-400" size={14} />
                      </div>
                    ) : (
                      <>
                        {/* All variants option */}
                        <div
                          className={`px-5 py-2 cursor-pointer hover:bg-blue-50 flex items-center gap-2 ${isItemSelected ? 'bg-blue-50 font-medium' : ''}`}
                          onClick={() => onSelectItem(item)}
                        >
                          <span className="text-xs text-blue-600 font-medium">All variants</span>
                        </div>

                        {visibleVariants.map(v => {
                          const isVSelected = selectedVariantId === v.id;
                          const stock = getVariantStock(v) ?? 0;
                          const label = [v.color_name, v.color_number].filter(Boolean).join(' ') || `Variant ${v.id}`;
                          const sizePart = v.variant_size ? ` · ${v.variant_size}` : '';
                          return (
                            <div
                              key={v.id}
                              onClick={() => onSelectVariant(item, v)}
                              className={`px-5 py-2 cursor-pointer hover:bg-blue-50 flex items-center justify-between ${isVSelected ? 'ring-2 ring-inset ring-blue-400 bg-blue-50' : ''}`}
                            >
                              <div className="min-w-0">
                                <p className="text-xs font-medium text-gray-700 truncate">{label}{sizePart}</p>
                              </div>
                              <span className="text-xs text-gray-500 ml-2 shrink-0">{formatNumber(stock)}</span>
                            </div>
                          );
                        })}

                        {zeroCount > 0 && (
                          <button
                            onClick={e => {
                              e.stopPropagation();
                              setShowZeroStockFor(prev => {
                                const next = new Set(prev);
                                showZero ? next.delete(item.id) : next.add(item.id);
                                return next;
                              });
                            }}
                            className="w-full px-5 py-1.5 text-left text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                          >
                            {showZero ? `Hide ${zeroCount} zero-stock` : `Show ${zeroCount} zero-stock`}
                          </button>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ledger Table Row
// ---------------------------------------------------------------------------

function LedgerRow({ row, isItemMode }) {
  const delta = formatDelta(row.delta ?? row.quantity_delta);
  const isReservation = (row.source_kind || '').startsWith('reservation_');
  const stockBefore = row.stock_before ?? row.quantity_before;
  const stockAfter = row.stock_after ?? row.quantity_after;
  const notes = row.notes || row.note || '';

  return (
    <tr className="hover:bg-gray-50 border-b border-gray-100">
      {/* Date/Time */}
      <td className="px-3 py-2.5 whitespace-nowrap text-xs text-gray-500">
        {formatDateTime(row.created_at || row.timestamp)}
      </td>

      {/* Event */}
      <td className="px-3 py-2.5">
        <SourceKindBadge sourceKind={row.source_kind} />
      </td>

      {/* Delta */}
      <td className="px-3 py-2.5 text-right">
        <span className={`font-mono text-sm font-semibold ${delta.cls}`}>{delta.text}</span>
      </td>

      {/* Stock Before → After */}
      <td className="px-3 py-2.5 whitespace-nowrap text-xs text-gray-400">
        {isReservation ? (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-purple-50 text-purple-500 text-xs">
            soft hold – no physical movement
          </span>
        ) : (
          <span>
            {formatNumber(stockBefore)}
            <span className="mx-1 text-gray-300">→</span>
            {formatNumber(stockAfter)}
          </span>
        )}
      </td>

      {/* Reference */}
      <td className="px-3 py-2.5 text-xs text-gray-600 font-mono">
        {getReference(row)}
      </td>

      {/* Unit Price */}
      <td className="px-3 py-2.5 text-xs text-gray-600 whitespace-nowrap">
        {formatCurrency(row.unit_price)}
      </td>

      {/* Variant pill — only in item mode */}
      {isItemMode && (
        <td className="px-3 py-2.5">
          <VariantPill
            colorName={row.color_name}
            colorNumber={row.color_number}
            variantSize={row.variant_size}
          />
        </td>
      )}

      {/* Operator */}
      <td className="px-3 py-2.5 text-xs text-gray-600 whitespace-nowrap">
        {row.user_name || row.operator || 'System'}
      </td>

      {/* Notes */}
      <td className="px-3 py-2.5 text-xs text-gray-500 max-w-[160px]" title={notes || undefined}>
        {truncate(notes, 40)}
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Right Pane
// ---------------------------------------------------------------------------

function RightPane({ selectedItem, selectedVariant, isItemMode }) {
  const [rows, setRows]                         = useState([]);
  const [loading, setLoading]                   = useState(false);
  const [sourceKindFilter, setSourceKindFilter] = useState('');
  const [limit, setLimit]                       = useState(50);
  const [offset, setOffset]                     = useState(0);
  const [totalCount, setTotalCount]             = useState(null);
  const fetchIdRef = useRef(0);

  // Reset offset whenever filters or selection change
  useEffect(() => {
    setOffset(0);
  }, [selectedItem?.id, selectedVariant?.id, sourceKindFilter, limit]);

  const fetchLedger = useCallback(() => {
    if (!selectedItem) return;

    const params = { limit, offset };
    if (sourceKindFilter) params.source_kind = sourceKindFilter;

    const fetchId = ++fetchIdRef.current;
    setLoading(true);

    const call = isItemMode
      ? trimsApi.getItemStockLedger(selectedItem.id, params)
      : trimsApi.getVariantStockLedger(selectedVariant.id, params);

    console.log('[TrimStockLedger] fetching', isItemMode ? 'item' : 'variant', isItemMode ? selectedItem.id : selectedVariant.id, params);

    call
      .then(res => {
        if (fetchId !== fetchIdRef.current) return;
        const data = res.data;
        console.log('[TrimStockLedger] ledger — HTTP', res.status);
        console.log('[TrimStockLedger] ledger — raw res.data', data);
        console.log('[TrimStockLedger] ledger — shape:', Array.isArray(data) ? 'bare array' : `object with keys: ${Object.keys(data).join(', ')}`);
        let newRows, total;
        if (Array.isArray(data)) {
          newRows = data;
          total = null;
        } else {
          newRows = data.rows || data.results || data.data || [];
          total = data.total ?? data.count ?? null;
        }
        console.log('[TrimStockLedger] ledger — parsed count', newRows.length, '| total:', total);
        if (newRows.length > 0) console.log('[TrimStockLedger] ledger — first row keys:', Object.keys(newRows[0]), newRows[0]);
        setRows(newRows);
        setTotalCount(total);
      })
      .catch((err) => {
        if (fetchId !== fetchIdRef.current) return;
        console.error('[TrimStockLedger] ledger fetch error', err);
        setRows([]);
      })
      .finally(() => {
        if (fetchId !== fetchIdRef.current) return;
        setLoading(false);
      });
  }, [selectedItem, selectedVariant, isItemMode, sourceKindFilter, limit, offset]);

  useEffect(() => {
    fetchLedger();
  }, [fetchLedger]);

  // #2 — currentStock from the chronologically newest row, not positional rows[0]
  const currentStock = rows.length > 0
    ? rows.reduce((latest, r) => {
        const t = new Date(r.created_at || r.timestamp || 0).getTime();
        return t > new Date(latest.created_at || latest.timestamp || 0).getTime() ? r : latest;
      }, rows[0])
    : null;
  const currentStockValue = currentStock
    ? (currentStock.stock_after ?? currentStock.quantity_after ?? null)
    : null;

  // #3 — Stats are page-scoped; label says so
  const totalIn = rows.reduce((sum, r) => {
    const d = Number(r.delta ?? r.quantity_delta ?? 0);
    return sum + (d > 0 ? d : 0);
  }, 0);

  const totalOut = rows.reduce((sum, r) => {
    const d = Number(r.delta ?? r.quantity_delta ?? 0);
    return sum + (d < 0 ? Math.abs(d) : 0);
  }, 0);

  // #9 — Count text that handles both paginated and bare-array responses
  const countText = loading
    ? '…'   // #4 — Don't show "No rows" while loading
    : rows.length === 0
      ? 'No rows'
      : totalCount !== null
        ? `${offset + 1}–${offset + rows.length} of ${totalCount}`
        : rows.length < limit
          ? `${offset + 1}–${offset + rows.length} (last page)`
          : `${offset + 1}–${offset + rows.length}`;

  // #10 — Next disabled when we know from totalCount that there's nothing more
  const nextDisabled = loading || (
    totalCount !== null
      ? offset + rows.length >= totalCount
      : rows.length < limit
  );

  if (!selectedItem) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400">
        <div className="text-center">
          <LuPackage size={48} className="mx-auto mb-3 text-gray-300" />
          <p className="text-sm">Select a trim item or variant from the left to view its stock ledger.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
      {/* Header strip */}
      <div className="px-6 py-4 bg-white border-b border-gray-200 flex flex-wrap items-center gap-4">
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-semibold text-gray-900 truncate">
            {selectedItem.item_name || selectedItem.name}
            {selectedVariant && (
              <span className="ml-2 text-gray-500 font-normal text-sm">
                {[selectedVariant.color_name, selectedVariant.color_number].filter(Boolean).join(' ')}
                {selectedVariant.variant_size ? ` · ${selectedVariant.variant_size}` : ''}
              </span>
            )}
          </h2>
          {isItemMode && (
            <p className="text-xs text-gray-400 mt-0.5">Showing all variants</p>
          )}
        </div>
        <div className="flex items-center gap-3">
          {currentStockValue !== null && (
            <div className="flex flex-col items-center bg-white border border-gray-200 rounded-lg px-4 py-2 min-w-[100px]">
              <span className="text-lg font-semibold font-mono text-gray-800">{formatNumber(currentStockValue)}</span>
              <span className="text-xs text-gray-500 mt-0.5">Current Stock</span>
            </div>
          )}
          {/* #3 — Labels clarify these are page-scoped */}
          <StatChip label="In (page)" value={totalIn} colorCls="text-emerald-600" />
          <StatChip label="Out (page)" value={totalOut} colorCls="text-red-500" />
        </div>
      </div>

      {/* Filter bar */}
      <div className="sticky top-0 z-10 px-6 py-2.5 bg-white border-b border-gray-200 flex flex-wrap items-center gap-3">
        <select
          value={sourceKindFilter}
          onChange={e => setSourceKindFilter(e.target.value)}
          className="text-sm border border-gray-200 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        >
          <option value="">All events</option>
          {Object.entries(SOURCE_KIND_META).map(([key, meta]) => (
            <option key={key} value={key}>{meta.label}</option>
          ))}
        </select>

        <select
          value={limit}
          onChange={e => setLimit(Number(e.target.value))}
          className="text-sm border border-gray-200 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        >
          {LIMIT_OPTIONS.map(l => (
            <option key={l} value={l}>Show {l}</option>
          ))}
        </select>

        <button
          onClick={fetchLedger}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 border border-gray-200 rounded-md hover:bg-gray-50"
        >
          <LuRefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>

        {/* #4 + #9 — Single source of truth for count text */}
        <span className="ml-auto text-xs text-gray-400">{countText}</span>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto relative">
        {loading && (
          <div className="absolute inset-0 bg-white/70 flex items-center justify-center z-10">
            <Loader2 className="animate-spin text-blue-500" size={28} />
          </div>
        )}

        {!loading && rows.length === 0 ? (
          <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
            No ledger entries found.
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead className="bg-gray-50 sticky top-0 z-[5]">
              <tr>
                <th className="px-3 py-2.5 text-xs font-semibold text-gray-500 whitespace-nowrap">Date / Time</th>
                <th className="px-3 py-2.5 text-xs font-semibold text-gray-500">Event</th>
                <th className="px-3 py-2.5 text-xs font-semibold text-gray-500 text-right">Delta</th>
                <th className="px-3 py-2.5 text-xs font-semibold text-gray-500 whitespace-nowrap">Stock Before → After</th>
                <th className="px-3 py-2.5 text-xs font-semibold text-gray-500">Reference</th>
                <th className="px-3 py-2.5 text-xs font-semibold text-gray-500 whitespace-nowrap">Unit Price</th>
                {isItemMode && (
                  <th className="px-3 py-2.5 text-xs font-semibold text-gray-500">Variant</th>
                )}
                <th className="px-3 py-2.5 text-xs font-semibold text-gray-500">Operator</th>
                <th className="px-3 py-2.5 text-xs font-semibold text-gray-500">Notes</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <LedgerRow key={row.id ?? i} row={row} isItemMode={isItemMode} />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      <div className="px-6 py-3 bg-white border-t border-gray-200 flex items-center justify-between">
        <button
          disabled={offset === 0 || loading}
          onClick={() => setOffset(Math.max(0, offset - limit))}
          className="flex items-center gap-1 px-3 py-1.5 text-sm border border-gray-200 rounded-md hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <LuChevronLeft size={14} /> Prev
        </button>
        <span className="text-xs text-gray-400">{countText}</span>
        {/* #10 — Next ddccisabled correctly using totalCount when available */}
        <button
          disabled={nextDisabled}
          onClick={() => setOffset(offset + limit)}
          className="flex items-center gap-1 px-3 py-1.5 text-sm border border-gray-200 rounded-md hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Next <LuChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page root
// ---------------------------------------------------------------------------

export default function TrimStockLedgerPage() {
  console.log('[TrimStockLedger] PAGE COMPONENT RENDERED');
  const [selectedItem, setSelectedItem]       = useState(null);
  const [selectedVariant, setSelectedVariant] = useState(null);
  const [isItemMode, setIsItemMode]           = useState(false);

  const handleSelectItem = useCallback((item) => {
    console.log('[TrimStockLedger] item selected', item);
    setSelectedItem(item);
    setSelectedVariant(null);
    setIsItemMode(true);
  }, []);

  const handleSelectVariant = useCallback((item, variant) => {
    console.log('[TrimStockLedger] variant selected', { item, variant });
    setSelectedItem(item);
    setSelectedVariant(variant);
    setIsItemMode(false);
  }, []);

  // #1 — -m-6 cancels the layout's p-6 wrapper; height fills the full main area
  return (
    <div className="flex overflow-hidden -m-6" style={{ height: 'calc(100% + 3rem)' }}>
      <LeftPane
        selectedItemId={selectedItem?.id ?? null}
        selectedVariantId={selectedVariant?.id ?? null}
        onSelectItem={handleSelectItem}
        onSelectVariant={handleSelectVariant}
      />
      <RightPane
        selectedItem={selectedItem}
        selectedVariant={selectedVariant}
        isItemMode={isItemMode}
      />
    </div>
  );
}

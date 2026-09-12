// ─── TRIM ORDER ITEMS GRID ───────────────────────────────────────────────────
// Rows = trim items (trimItemGroups), columns = the order's colors. Same
// row/column/cell-as-button structure as the merchandiser planning module's
// TrimRequirementsGrid — click a cell to open the drilldown/fulfill modal for
// that item — but this grid answers a different question (pick/fulfill from
// stock against an order already placed, not reserve stock against a plan),
// so its chrome is deliberately NOT a copy of planning's: indigo/blue accents
// (matching this page's own existing toolbar palette) instead of planning's
// violet, a page-identifying header label, and this domain's own
// blue/green/red/purple status vocabulary instead of planning's
// red/blue/yellow/green — see trimOrderCellStatus.js for why they aren't
// shared. The same store manager moves between both screens; looking
// different at a glance matters as much as working the same way.

import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Search, Layers, RefreshCw, PackageCheck, Loader2 } from 'lucide-react';
import { buildTrimOrderGridModel } from './buildTrimOrderGridModel';
import { getTrimOrderItemCellStatus, CELL_COLOR_CLS, CELL_COLOR_DOT } from './trimOrderCellStatus';
import { computeBomVariance } from './trimOrderBomVariance';
import HorizontalScrollFrame from '../merchandiser/HorizontalScrollFrame';

// Fulfilled quantity aggregated by the color it was actually fulfilled WITH
// (not the requested color) — surfaces "42 pcs fulfilled with BLACK, 10 with
// WHITE" for a whole trim item at a glance. Pure function of one row's items,
// ported from TrimOrderDetailPage's old per-selected-group memo.
const computeFulfilledByColor = (items = []) => {
    const map = new Map();
    items.forEach(it => {
        (it.fulfillment_log || []).forEach(log => {
            const colorNum  = log.fulfilled_color_number ?? log.color_number ?? log.fulfilling_color_number ?? null;
            const colorName = log.fulfilled_color_name   ?? log.color_name   ?? log.fulfilling_color_name   ?? null;
            const variantId = log.fulfilled_variant_id   ?? log.fulfilling_variant_id ?? log.variant_id ?? null;
            const qty       = Number(log.quantity_fulfilled ?? log.quantity ?? log.qty ?? 0);
            const key       = String(colorNum ?? colorName ?? `var-${variantId ?? 'unknown'}`);
            const variantKey = String(variantId ?? colorNum ?? colorName ?? key);
            if (!map.has(key)) {
                map.set(key, { color_number: colorNum, color_name: colorName || 'Unknown', total_qty: 0, variants: new Set() });
            }
            const e = map.get(key);
            e.total_qty += qty;
            e.variants.add(variantKey);
        });
    });
    return [...map.values()].map(e => ({ ...e, variant_count: e.variants.size })).sort((a, b) => b.total_qty - a.total_qty);
};

// Worst-case status across a multi-item ("×N sizes") cell: insufficient beats
// substitute beats exact beats fulfilled — i.e. show whatever most needs
// attention first.
const PRIORITY = { red: 0, purple: 1, blue: 2, green: 3 };
const aggregateStatus = (items, getEffectivePlan) => {
    let worst = null;
    items.forEach(item => {
        const s = getTrimOrderItemCellStatus(item, getEffectivePlan(item));
        if (!worst || PRIORITY[s.color] < PRIORITY[worst.color]) worst = s;
    });
    return worst;
};

// Row label hover popover — fulfilled-by-color breakdown + condensed BOM
// variance for the whole trim item. Mirrors the interaction mechanism of
// planning's ReservedVariantSummary (portal-rendered, positioned off the
// anchor's own bounding rect) so this doesn't introduce a new UI idiom.
const RowSummaryPopover = ({ label, itemCode, items, refData, refDataLoaded, reservationsByVariantId, onOpenUsage }) => {
    const [open, setOpen] = useState(false);
    const [pos, setPos]   = useState(null);
    const anchorRef = useRef(null);

    const byColor = computeFulfilledByColor(items);
    const bom = computeBomVariance(items, refData, refDataLoaded);

    // Aggregate buyer-reservation numbers across every variant this row's
    // items carry — same aggregation the old per-selected-group card did,
    // now read from the page's prefetched map instead of a fresh fetch.
    const variantIds = [...new Set(items.map(it => it.trim_item_variant_id).filter(v => v != null))];
    const reservation = variantIds.reduce((acc, vId) => {
        const r = reservationsByVariantId?.get(String(vId));
        if (!r) return acc;
        return { reserved: acc.reserved + r.reserved, active: acc.active + r.active, consumed: acc.consumed + r.consumed };
    }, { reserved: 0, active: 0, consumed: 0 });
    const hasReservation = reservation.reserved > 0;

    if (byColor.length === 0 && !bom.bomEntry && !hasReservation) {
        return <>{label}{itemCode && <span className="block font-mono font-normal text-[9px] text-slate-400">{itemCode}</span>}</>;
    }

    const show = () => {
        const rect = anchorRef.current?.getBoundingClientRect();
        if (rect) setPos({ top: rect.bottom + 6, left: rect.left });
        setOpen(true);
    };

    return (
        <span
            ref={anchorRef}
            onMouseEnter={show}
            onMouseLeave={() => setOpen(false)}
            className="cursor-help border-b border-dotted border-indigo-300"
        >
            {label}
            {itemCode && <span className="block font-mono font-normal text-[9px] text-slate-400">{itemCode}</span>}
            {open && pos && createPortal(
                <div
                    className="fixed z-[9999] bg-white border border-indigo-100 rounded-xl shadow-xl p-2.5 normal-case"
                    style={{ top: pos.top, left: pos.left, maxWidth: 420 }}
                >
                    {bom.bomEntry && (
                        <p className="text-[10px] font-semibold mb-1.5 px-0.5">
                            <span className="text-slate-400 uppercase tracking-wider text-[8px] font-bold">BOM check</span>{' '}
                            {bom.variance == null
                                ? <span className="text-slate-400">no cut data</span>
                                : bom.isMatch
                                    ? <span className="text-emerald-600 font-bold">✓ matches BOM</span>
                                    : <span className={bom.isOver ? 'text-amber-600 font-bold' : 'text-red-600 font-bold'}>
                                        {bom.isOver ? '+' : ''}{bom.variance.toLocaleString()} vs BOM ({bom.pctOff}%)
                                    </span>}
                        </p>
                    )}
                    {byColor.length > 0 && (
                        <>
                            <p className={`text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1 px-0.5 ${bom.bomEntry ? 'mt-2' : ''}`}>
                                Fulfilled by color
                            </p>
                            <div className="space-y-1">
                                {byColor.map((c, i) => (
                                    <div key={i} className="flex items-center justify-between gap-3 text-[11px]">
                                        <span className="font-bold text-slate-700">
                                            {c.color_name}{c.color_number ? <span className="text-slate-400 font-mono text-[9px] ml-1">{c.color_number}</span> : null}
                                        </span>
                                        <span className="font-bold text-emerald-700 tabular-nums">{c.total_qty.toLocaleString()}</span>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                    {hasReservation && (
                        <div className={`flex items-center gap-3 text-[10px] px-0.5 ${(bom.bomEntry || byColor.length > 0) ? 'mt-2 pt-1.5 border-t border-slate-100' : ''}`}>
                            <span className="text-slate-500"><span className="font-bold text-blue-700">{reservation.reserved.toLocaleString()}</span> reserved</span>
                            <button
                                type="button"
                                onClick={() => onOpenUsage?.(variantIds, label)}
                                disabled={reservation.consumed <= 0}
                                className="text-orange-700 font-bold hover:underline disabled:no-underline disabled:cursor-default"
                            >
                                {reservation.consumed.toLocaleString()} used
                            </button>
                            <span className={reservation.active > 0 ? 'text-emerald-700 font-bold' : 'text-red-600 font-bold'}>{reservation.active.toLocaleString()} left</span>
                        </div>
                    )}
                </div>,
                document.body
            )}
        </span>
    );
};

const EmptyCell = () => <td className="border border-slate-100 bg-slate-50/40 p-2 align-top" />;

const OrderItemCell = ({ item, plan, isOverridden, onClick }) => {
    const status = getTrimOrderItemCellStatus(item, plan);
    const required  = Number(item.quantity_required || 0);
    const fulfilled = Number(item.quantity_fulfilled || 0);
    const isFulfilledRow = plan.decision === 'fulfilled';
    return (
        <td className="border border-slate-100 p-1 align-top">
            <button
                type="button"
                onClick={onClick}
                className={`w-full min-w-[110px] rounded-lg border px-2.5 py-2 text-left transition-colors ${CELL_COLOR_CLS[status.color]}`}
                title={`${status.label} · ${isFulfilledRow ? `${fulfilled}/${required} fulfilled` : `${plan.quantity_to_fulfill || 0} planned of ${required} required`}${isOverridden ? ' · manually overridden' : ''}`}
            >
                <div className="flex items-center justify-between gap-1">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${CELL_COLOR_DOT[status.color]}`} />
                    <div className="flex items-center gap-1">
                        {isOverridden && <span className="text-amber-600 text-[10px] leading-none">★</span>}
                        {status.isHandedOver && <PackageCheck size={10} className="opacity-70" />}
                    </div>
                </div>
                <p className="text-xs font-bold mt-1 tabular-nums">
                    {isFulfilledRow
                        ? <>{fulfilled.toLocaleString()}<span className="opacity-50">/{required.toLocaleString()}</span></>
                        : <>{(plan.quantity_to_fulfill || 0).toLocaleString()}<span className="opacity-50">/{required.toLocaleString()}</span></>}
                </p>
                <p className="text-[9px] opacity-70 truncate">{status.label}</p>
            </button>
        </td>
    );
};

const MultiSizeCell = ({ items, getEffectivePlan, onClick }) => {
    const status = aggregateStatus(items, getEffectivePlan);
    const required  = items.reduce((s, it) => s + Number(it.quantity_required  || 0), 0);
    const fulfilled = items.reduce((s, it) => s + Number(it.quantity_fulfilled || 0), 0);
    return (
        <td className="border border-slate-100 p-1 align-top">
            <button
                type="button"
                onClick={onClick}
                className={`w-full min-w-[110px] rounded-lg border px-2.5 py-2 text-left transition-colors ${CELL_COLOR_CLS[status.color]}`}
                title={`${items.length} sizes · ${fulfilled.toLocaleString()}/${required.toLocaleString()} total`}
            >
                <div className="flex items-center justify-between gap-1">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${CELL_COLOR_DOT[status.color]}`} />
                    <span className="text-[8px] font-bold uppercase tracking-wide opacity-70">×{items.length} sizes</span>
                </div>
                <p className="text-xs font-bold mt-1 tabular-nums">{fulfilled.toLocaleString()}<span className="opacity-50">/{required.toLocaleString()}</span></p>
            </button>
        </td>
    );
};

const TrimOrderItemsGrid = ({
    trimItemGroups,
    getEffectivePlan,
    overrides,
    refData,
    refDataLoaded,
    reservationsByVariantId,
    onOpenUsage,
    onCellClick,
    onRowBulkFulfill,
    onRowRecompute,
    recomputeBlocked,
    recomputingId,
    rowBusyKey,
    isClosed,
    actionsDisabled,
}) => {
    const [filterText, setFilterText] = useState('');
    const { columns, rows } = buildTrimOrderGridModel(trimItemGroups);

    if (rows.length === 0) {
        return (
            <div className="text-center py-12 border-2 border-dashed border-slate-200 rounded-xl">
                <p className="text-sm text-slate-400 italic">No items on this order yet.</p>
            </div>
        );
    }

    const q = filterText.trim().toLowerCase();
    const filteredRows = q ? rows.filter(r => r.name.toLowerCase().includes(q)) : rows;

    return (
        <div>
            <div className="flex items-center gap-2 mb-2">
                <PackageCheck size={14} className="text-indigo-600" />
                <p className="text-xs font-bold text-indigo-700 uppercase tracking-wider">Fulfillment Grid · this order</p>
                <span className="text-[10px] text-slate-400 font-medium">{rows.length} trim item{rows.length === 1 ? '' : 's'} × {columns.length} color{columns.length === 1 ? '' : 's'}</span>
            </div>
            <HorizontalScrollFrame>
                <table className="border-collapse w-full">
                    <thead>
                        <tr>
                            <th className="sticky left-0 z-10 bg-white border border-indigo-100 px-3 py-1.5 text-left min-w-[190px]">
                                <div className="relative">
                                    <Search size={11} className="absolute left-1.5 top-1/2 -translate-y-1/2 text-slate-300" />
                                    <input
                                        type="text"
                                        value={filterText}
                                        onChange={e => setFilterText(e.target.value)}
                                        placeholder="Filter trim item…"
                                        className="w-full pl-5 pr-1.5 py-1 text-[10px] font-bold text-slate-600 uppercase tracking-wider placeholder:font-normal placeholder:normal-case placeholder:text-slate-400 bg-slate-50 border border-slate-200 rounded outline-none focus:ring-1 focus:ring-indigo-300 focus:border-indigo-300"
                                    />
                                </div>
                            </th>
                            {columns.map(col => (
                                <th key={col.colorKey} className="border border-indigo-100 px-2 py-2 text-center text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                                    {col.color_name}
                                    {col.color_number && <span className="block font-mono font-normal normal-case text-slate-400">{col.color_number}</span>}
                                </th>
                            ))}
                            <th className="border border-indigo-100 px-2 py-2 text-center text-[10px] font-bold text-slate-500 uppercase tracking-wider w-28">
                                Actions
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredRows.length === 0 && (
                            <tr>
                                <td colSpan={columns.length + 2} className="text-center py-6 text-xs text-slate-400 italic">
                                    No trim items match "{filterText}".
                                </td>
                            </tr>
                        )}
                        {filteredRows.map(row => {
                            const fulfillable = row.items.filter(it => {
                                const p = getEffectivePlan(it);
                                return p.decision !== 'fulfilled' && p.fulfilling_variant_id && p.quantity_to_fulfill > 0;
                            });
                            return (
                                <tr key={row.rowKey}>
                                    <td className="sticky left-0 z-10 bg-white border border-indigo-100 px-3 py-2 text-xs font-bold text-slate-700 align-top">
                                        <RowSummaryPopover
                                            label={row.name}
                                            items={row.items}
                                            refData={refData}
                                            refDataLoaded={refDataLoaded}
                                            reservationsByVariantId={reservationsByVariantId}
                                            onOpenUsage={onOpenUsage}
                                        />
                                        {row.handedOver > 0 && (
                                            <span className="block text-[9px] font-normal text-teal-600 mt-0.5">{row.handedOver}/{row.total} handed over</span>
                                        )}
                                    </td>
                                    {columns.map(col => {
                                        const cellItems = row.cellsByColorKey[col.colorKey];
                                        if (!cellItems || cellItems.length === 0) return <EmptyCell key={col.colorKey} />;
                                        if (cellItems.length === 1) {
                                            const item = cellItems[0];
                                            const plan = getEffectivePlan(item);
                                            return (
                                                <OrderItemCell
                                                    key={col.colorKey}
                                                    item={item}
                                                    plan={plan}
                                                    isOverridden={!!overrides[item.id]}
                                                    onClick={() => onCellClick(cellItems, row.name)}
                                                />
                                            );
                                        }
                                        return (
                                            <MultiSizeCell
                                                key={col.colorKey}
                                                items={cellItems}
                                                getEffectivePlan={getEffectivePlan}
                                                onClick={() => onCellClick(cellItems, row.name)}
                                            />
                                        );
                                    })}
                                    {row.orphanCells.length > 0 && (
                                        <td className="border border-slate-100 p-1 align-top">
                                            <div className="w-full min-w-[80px] rounded-lg border border-dashed border-slate-300 bg-slate-100 px-2 py-2 text-slate-400" title="Item(s) with a color that couldn't be placed in a column">
                                                <AlertTriangle size={12} />
                                            </div>
                                        </td>
                                    )}
                                    <td className="border border-indigo-100 p-1 align-top">
                                        <div className="flex flex-col gap-1">
                                            <button
                                                type="button"
                                                onClick={() => onRowBulkFulfill(row)}
                                                disabled={isClosed || actionsDisabled || fulfillable.length === 0}
                                                title={fulfillable.length === 0 ? 'Nothing planned to allocate for this trim item' : `Allocate ${fulfillable.length} planned variant(s)`}
                                                className="w-full flex items-center justify-center gap-1 rounded-md border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors px-1.5 py-1"
                                            >
                                                {rowBusyKey === row.name ? <Loader2 size={11} className="animate-spin" /> : <Layers size={11} />}
                                                <span className="text-[9px] font-bold uppercase tracking-wide">Allocate {fulfillable.length}</span>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => onRowRecompute(row)}
                                                disabled={recomputeBlocked || actionsDisabled}
                                                title={recomputeBlocked ? 'Recompute is locked in this order status' : 'Re-run the BOM × cut-pieces calculation for this trim item'}
                                                className="w-full flex items-center justify-center gap-1 rounded-md border border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors px-1.5 py-1"
                                            >
                                                {recomputingId === row.name ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
                                                <span className="text-[9px] font-bold uppercase tracking-wide">Re-verify</span>
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </HorizontalScrollFrame>
        </div>
    );
};

export default TrimOrderItemsGrid;

// ─── TRIM ORDER ITEM DRILLDOWN MODAL ─────────────────────────────────────────
// Opens when a TrimOrderItemsGrid cell is clicked. Replaces both the old
// inline override popover and the old FulfillmentModal with one surface:
// item-scoped stats + fulfillment history, group-scoped BOM variance
// (explicitly labeled — BOM consumption is defined per trim item, not per
// color, so it can't be scoped any tighter than the whole row), item-scoped
// buyer-reservation numbers (read from a prefetched map, not a fresh fetch
// per open), and a fulfill/override control offering both of the page's two
// existing commit paths unchanged: "Save selection" stages an override
// (no network call — the old chip-pick behavior) and "Confirm & Fulfill now"
// commits immediately (the old full-dialog behavior).

import { useEffect, useState } from 'react';
import { LuReplace, LuTriangleAlert, LuTrash2, LuX } from 'react-icons/lu';
import { getTrimOrderItemCellStatus, effectiveStockOf, reservedOf } from './trimOrderCellStatus';
import { computeBomVariance } from './trimOrderBomVariance';

// The exact-match variant (if there's stock) plus every registered substitute,
// normalized to a common { id, is_substitute } shape for the radio list.
const buildFulfillmentOptions = (item) => [
    ...(item.available_stock > 0 ? [{ ...item, id: item.trim_item_variant_id, is_substitute: false }] : []),
    ...(item.substitutes || []).map(sub => ({ ...sub, id: sub.substitute_variant_id, is_substitute: true })),
];

const TrimOrderItemDrilldownModal = ({
    cellItems,
    rowGroupName,
    rowItems,
    refData,
    refDataLoaded,
    reservationsByVariantId,
    overrides,
    getEffectivePlan,
    isClosed,
    apiError,
    onClose,
    onSaveOverride,
    onResetOverride,
    onConfirmFulfill,
    onOpenUsage,
    onRevertFulfillment,
}) => {
    const [activeIdx, setActiveIdx] = useState(0);
    const [showBom, setShowBom] = useState(false);
    const item = cellItems[Math.min(activeIdx, cellItems.length - 1)];
    const plan = getEffectivePlan(item);
    const status = getTrimOrderItemCellStatus(item, plan);
    const isOverridden = !!overrides[item.id];
    const isFulfilledRow = plan.decision === 'fulfilled';
    const remaining = Math.max(0, item.quantity_required - item.quantity_fulfilled);

    const fulfillmentOptions = buildFulfillmentOptions(item);
    const [selectedVariantId, setSelectedVariantId] = useState(fulfillmentOptions[0]?.id || '');
    const [quantity, setQuantity] = useState(remaining);
    const [validationErr, setValidationErr] = useState(null);

    // Re-derive defaults whenever the active item changes (size-switch or reopen).
    useEffect(() => {
        const opts = buildFulfillmentOptions(item);
        setSelectedVariantId(opts[0]?.id || '');
        setQuantity(Math.max(0, item.quantity_required - item.quantity_fulfilled));
        setValidationErr(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [item.id]);

    const selectedOption = fulfillmentOptions.find(opt => opt.id === selectedVariantId);
    const maxAllowed = selectedOption ? Math.min(remaining, selectedOption.available_stock) : 0;

    const locked = isClosed || isFulfilledRow;
    // Which variant's reservation numbers to show: once locked, show the variant
    // that actually fulfilled this item (from its own history — reliable
    // regardless of what `planned_fulfillment` does once a row is done),
    // falling back to the plan/exact variant; while still deciding, track
    // whatever the user currently has selected in the picker below.
    const lastLog = (item.fulfillment_log || [])[item.fulfillment_log?.length - 1];
    const historicalVariantId = lastLog?.fulfilled_variant_id ?? lastLog?.fulfilling_variant_id ?? lastLog?.variant_id ?? null;
    const displayVariantId = locked
        ? (historicalVariantId ?? plan.fulfilling_variant_id ?? item.trim_item_variant_id)
        : selectedVariantId;
    const reservationInfo = displayVariantId ? reservationsByVariantId?.get(String(displayVariantId)) : null;

    // Scope the BOM check to the color being allocated (not the whole
    // trim-item row across every color) — the row-level "all colors" check
    // compares this color's requirement against every other color's cut
    // pieces too, which isn't a meaningful signal while allocating one
    // specific variant. Color-agnostic trims have no color to scope to, so
    // they keep the all-colors check (it's already the only correct scope).
    const bomScopeColor = !item.is_color_agnostic && item.color_name ? item.color_name : null;
    const bom = computeBomVariance(rowItems || cellItems, refData, refDataLoaded, bomScopeColor);

    const handleSave = () => {
        if (!selectedOption) { setValidationErr('Select an item to fulfill with.'); return; }
        setValidationErr(null);
        const source = selectedOption.is_substitute ? selectedOption : { __isExact: true };
        onSaveOverride(item, source);
        onClose();
    };

    const handleConfirm = () => {
        if (!selectedOption) { setValidationErr('Select an item to fulfill with.'); return; }
        if (isNaN(quantity) || quantity <= 0) { setValidationErr('Enter a quantity greater than 0.'); return; }
        if (quantity > maxAllowed) { setValidationErr(`Quantity cannot exceed available stock (${selectedOption.available_stock}) or remaining required (${remaining}).`); return; }
        setValidationErr(null);
        onConfirmFulfill({
            orderItemId:         item.id,
            quantityToFulfill:   quantity,
            fulfillingVariantId: selectedVariantId,
        });
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 z-50 flex justify-center items-center p-4" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="px-4 py-3 border-b flex items-start justify-between gap-3 shrink-0">
                    <div className="min-w-0">
                        <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-wider">{status.label}</p>
                        <h3 className="text-base font-bold text-gray-800 truncate">{rowGroupName}</h3>
                        <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                            <span className="text-[11px] font-black text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded-full">
                                {item.color_name || 'AGNOSTIC'}{item.color_number ? ` (${item.color_number})` : ''}
                            </span>
                            {item.variant_size && (
                                <span className="text-xs text-gray-500">Size {item.variant_size}</span>
                            )}
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors shrink-0">
                        <LuX className="h-4 w-4 text-gray-500" />
                    </button>
                </div>

                <div className="p-4 space-y-3 bg-gray-50 overflow-y-auto flex-1">
                    {/* Size picker — only when this cell holds more than one variant_size */}
                    {cellItems.length > 1 && (
                        <div className="flex flex-wrap gap-1.5">
                            {cellItems.map((it, i) => (
                                <button
                                    key={it.id}
                                    type="button"
                                    onClick={() => setActiveIdx(i)}
                                    className={`text-xs font-bold px-2.5 py-1 rounded-full border transition-colors ${i === activeIdx ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300'}`}
                                >
                                    Size {it.variant_size || '—'}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Item-scoped stats */}
                    <div className="grid grid-cols-3 gap-2 text-center bg-white rounded-lg border border-gray-200 p-2.5">
                        <div>
                            <p className="text-[9px] font-bold text-gray-400 uppercase">Required</p>
                            <p className="text-sm font-extrabold text-gray-800 tabular-nums">{Number(item.quantity_required || 0).toLocaleString()}</p>
                        </div>
                        <div>
                            <p className="text-[9px] font-bold text-gray-400 uppercase">Fulfilled</p>
                            <p className="text-sm font-extrabold text-emerald-700 tabular-nums">{Number(item.quantity_fulfilled || 0).toLocaleString()}</p>
                        </div>
                        <div>
                            <p className="text-[9px] font-bold text-gray-400 uppercase">Remaining</p>
                            <p className={`text-sm font-extrabold tabular-nums ${remaining > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>{remaining.toLocaleString()}</p>
                        </div>
                    </div>

                    {/* Buyer reservation for this item — always visible, not just while
                        actively picking a variant, so it's still checkable on an already-
                        fulfilled item or a closed order. */}
                    <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-1.5 text-xs">
                        <p className="font-bold text-blue-700 mb-1 uppercase tracking-wider text-[10px]">
                            Buyer reservation {locked ? 'for the fulfilling variant' : 'for the selected variant'}
                        </p>
                        {reservationInfo ? (
                            <div className="flex items-center gap-4">
                                <span className="text-slate-600"><span className="font-bold text-blue-800">{reservationInfo.reserved.toLocaleString('en-IN')}</span> reserved</span>
                                <button
                                    type="button"
                                    onClick={() => onOpenUsage([displayVariantId], `${item.item_name}${item.color_name ? ` — ${item.color_name}` : ''}`)}
                                    disabled={reservationInfo.consumed <= 0}
                                    className="font-bold text-orange-700 hover:underline disabled:no-underline disabled:cursor-default"
                                >
                                    {reservationInfo.consumed.toLocaleString('en-IN')} used
                                </button>
                                <span className={`font-bold ${reservationInfo.active > 0 ? 'text-emerald-700' : 'text-red-600'}`}>{reservationInfo.active.toLocaleString('en-IN')} left</span>
                            </div>
                        ) : (
                            <p className="text-amber-700 flex items-center gap-1"><LuTriangleAlert size={11} /> No reservation found{locked ? '' : ' — ask buyer to reserve first'}.</p>
                        )}
                    </div>

                    {/* BOM variance — scoped to this color's own requirement vs. only the
                        pieces cut in this color, when the trim isn't color-agnostic
                        (falls back to the whole row across all colors otherwise).
                        Collapsed by default behind a status pill — click to reveal
                        the full comparison; keeps the modal compact when this is
                        just a background sanity check, not the thing being decided. */}
                    {refDataLoaded && !bom.bomEntry ? (
                        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 flex items-center gap-2">
                            <LuTriangleAlert className="h-4 w-4 text-red-500 shrink-0" />
                            <p className="text-xs font-bold text-red-700">No BOM entry found for this trim item.</p>
                        </div>
                    ) : bom.bomEntry ? (
                        <div className="rounded-lg border border-violet-200 bg-violet-50 overflow-hidden">
                            <button
                                type="button"
                                onClick={() => setShowBom(v => !v)}
                                className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left"
                            >
                                <span className="text-[9px] font-bold uppercase tracking-wider text-violet-500 truncate">
                                    BOM check · {bom.colorFilter || 'all colors'}
                                </span>
                                <span className="flex items-center gap-1.5 shrink-0">
                                    {bom.noCuttingForScope || bom.variance == null ? (
                                        <span className="text-[10px] font-bold text-gray-400">no cut data</span>
                                    ) : bom.isMatch ? (
                                        <span className="text-[10px] font-bold text-emerald-700">✓ match</span>
                                    ) : (
                                        <span className={`text-[10px] font-bold ${bom.isOver ? 'text-amber-700' : 'text-red-700'}`}>
                                            {bom.isOver ? '+' : ''}{bom.variance.toLocaleString()} ({bom.pctOff}%)
                                        </span>
                                    )}
                                    <span className="text-violet-400 text-[9px]">{showBom ? '▲' : '▼'}</span>
                                </span>
                            </button>
                            {showBom && (
                                <div className="px-3 pb-2.5">
                                    {bom.noCuttingForScope ? (
                                        <p className="text-sm text-gray-500">No cut data yet in this color.</p>
                                    ) : bom.variance == null ? (
                                        <p className="text-sm text-gray-500">No cut data yet.</p>
                                    ) : bom.isMatch ? (
                                        <p className="text-sm font-bold text-emerald-700">✓ Matches BOM ({bom.totalRequired.toLocaleString()} required)</p>
                                    ) : (
                                        <p className={`text-sm font-bold ${bom.isOver ? 'text-amber-700' : 'text-red-700'}`}>
                                            {bom.isOver ? '+' : ''}{bom.variance.toLocaleString()} vs BOM-derived {bom.bomDerived?.toLocaleString()} ({bom.pctOff}%)
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>
                    ) : null}

                    {/* Fulfill / override control */}
                    {locked ? (
                        <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-500">
                            {isClosed ? 'Order is closed — fulfillment is locked.' : 'Already fulfilled.'}
                        </div>
                    ) : (
                        <div className="space-y-1.5">
                            <label className="block text-sm font-medium text-gray-700">Select item to fulfill with</label>
                            <div className="space-y-1.5">
                                {fulfillmentOptions.length === 0 && (
                                    <p className="text-xs text-red-600 italic">No exact stock or substitutes available.</p>
                                )}
                                {fulfillmentOptions.map(option => (
                                    <label key={option.id} className={`flex items-center p-2.5 border-2 rounded-lg cursor-pointer transition-all ${selectedVariantId === option.id ? 'border-indigo-500 bg-indigo-50 shadow-sm' : 'border-gray-200 bg-white hover:border-indigo-300'}`}>
                                        <input type="radio" name="fulfillment-variant" checked={selectedVariantId === option.id} onChange={() => setSelectedVariantId(option.id)} className="h-4 w-4 text-indigo-600 focus:ring-indigo-500" />
                                        <div className="ml-3 flex-1 min-w-0 flex items-center justify-between gap-2">
                                            <span className="text-[11px] font-black text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded-full truncate">
                                                {option.color_name || 'AGNOSTIC'}{option.color_number ? ` (${option.color_number})` : ''}
                                            </span>
                                            <div className="flex items-center gap-1.5 shrink-0">
                                                {option.is_substitute && (
                                                    <span className="text-[9px] font-extrabold text-purple-600 bg-purple-100 px-1.5 py-0.5 rounded flex items-center"><LuReplace className="mr-1" size={10} />SUB</span>
                                                )}
                                                <span className="text-xs text-gray-600 font-medium bg-gray-100 px-2 rounded">
                                                    Stock: {option.available_stock}
                                                    {reservedOf(option) > 0 && <span className="ml-1 text-gray-400">→ net {effectiveStockOf(option)}</span>}
                                                </span>
                                            </div>
                                        </div>
                                    </label>
                                ))}
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Quantity to fulfill (remaining: {remaining})</label>
                                <input type="number" value={quantity} onChange={e => setQuantity(parseInt(e.target.value, 10) || 0)} className="w-full p-2 border border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-indigo-500 outline-none font-bold" min="1" max={maxAllowed} />
                            </div>

                            {validationErr && (
                                <p className="text-sm text-red-600 flex items-center gap-1.5 font-medium"><LuTriangleAlert size={14} /> {validationErr}</p>
                            )}
                            {apiError && (
                                <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">
                                    <p className="font-semibold flex items-center gap-1.5"><LuTriangleAlert size={14} /> {apiError.message}</p>
                                </div>
                            )}

                            <div className="flex items-center justify-between gap-2 pt-1">
                                {isOverridden ? (
                                    <button onClick={() => onResetOverride(item.id)} className="text-xs text-amber-700 font-bold hover:underline">Reset to plan</button>
                                ) : <span />}
                                <div className="flex gap-2">
                                    <button onClick={handleSave} className="px-3 py-1.5 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition-colors">
                                        Save selection
                                    </button>
                                    <button onClick={handleConfirm} className="px-3 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors shadow-sm">
                                        Confirm &amp; Fulfill now
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Fulfillment history — this item's own log */}
                    {(item.fulfillment_log || []).length > 0 && (
                        <div>
                            <p className="text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-1">Fulfillment history</p>
                            <div className="space-y-1">
                                {item.fulfillment_log.map(log => {
                                    const isIssued = !!log.issue_id;
                                    return (
                                        <div key={log.id} className="flex items-center justify-between bg-white border border-gray-200 px-2.5 py-1 rounded text-[11px]">
                                            <span className="truncate">
                                                <span className="bg-gray-200 text-gray-700 px-1 rounded mr-1.5 font-mono">{log.quantity_fulfilled}×</span>
                                                {log.fulfilled_color_name} {log.fulfilled_color_number}
                                                {log.used_substitute && <span className="text-purple-600 font-bold ml-1.5 bg-purple-50 px-1 rounded">sub</span>}
                                            </span>
                                            {isIssued ? (
                                                <span className="text-green-700 font-bold bg-green-50 border border-green-200 px-1.5 py-0.5 rounded whitespace-nowrap" title="Custody transferred — this allocation went out on a signed issue slip and can no longer be reverted">
                                                    handed over{log.issue_number ? ` · ${log.issue_number}` : ''}
                                                </span>
                                            ) : (
                                                <button
                                                    onClick={() => onRevertFulfillment(log.id)}
                                                    disabled={isClosed}
                                                    className={`p-1 rounded transition-colors ${isClosed ? 'text-gray-300 cursor-not-allowed' : 'text-red-400 hover:text-white hover:bg-red-500'}`}
                                                    title={isClosed ? 'Order is closed — fulfillment is locked' : 'Undo this allocation (no stock moves)'}
                                                >
                                                    <LuTrash2 size={11} />
                                                </button>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>

                <div className="px-4 py-2.5 border-t border-gray-100 flex justify-end shrink-0">
                    <button onClick={onClose} className="px-4 py-1.5 text-sm font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors">Close</button>
                </div>
            </div>
        </div>
    );
};

export default TrimOrderItemDrilldownModal;

// ─── RESERVE / FULFIL MODAL ─────────────────────────────────────────────────────
// Reserves stock against a single fabric or trim requirement — fabric picks one
// or more rolls + meters, trim picks an exact/substitute variant + quantity.
// Invoked by RequirementCellDrilldownModal for the requirement behind whichever
// grid cell the user clicked.

import { useState, useMemo } from 'react';
import { Loader2, Search, CheckCircle2, Link2, X } from 'lucide-react';
import { planningApi } from '../../api/planningApi';

// Buyer reservations may not exceed the calculated requirement by more than this —
// caps accidental over-reservation while still allowing a small rounding buffer.
export const RESERVE_OVER_LIMIT_PCT = 0.10;

const ReserveFulfillModal = ({ item, onClose, onDone }) => {
    const [busy,     setBusy]     = useState(false);
    const [err,      setErr]      = useState(null);

    // ── Trim: 'exact' | substitute_variant_id string ────────────────────────
    const [sourceId, setSourceId] = useState('exact');
    const [trimQty,  setTrimQty]  = useState(() =>
        String(Math.max(0, (item.quantity_required || 0) - (item.quantity_reserved || 0)))
    );

    // ── Fabric: per-roll selection map { [roll_id]: meters_string } ──────────
    const [rollSearch, setRollSearch] = useState('');

    const [rollSel, setRollSel] = useState(() => {
        if (item.type !== 'fabric') return {};
        const needed = (item.meters_required || 0) - (item.meters_reserved || 0);
        let left = needed;
        const sel = {};
        for (const roll of (item.available_rolls || [])) {
            if (left <= 0) break;
            const free = parseFloat(roll.free_meters ?? roll.meter ?? 0);
            if (free <= 0) continue;
            sel[roll.roll_id] = String(Math.min(free, left).toFixed(2));
            left -= Math.min(free, left);
        }
        return sel;
    });

    const toggleRoll = (rollId, free) =>
        setRollSel(prev =>
            rollId in prev
                ? (({ [rollId]: _, ...rest }) => rest)(prev)
                : { ...prev, [rollId]: String(parseFloat(free || 0).toFixed(2)) }
        );

    const setRollMeters = (rollId, v) =>
        setRollSel(prev => ({ ...prev, [rollId]: v }));

    const totalSelected = Object.values(rollSel).reduce((s, v) => s + (parseFloat(v) || 0), 0);
    const needed        = (item.meters_required || 0) - (item.meters_reserved || 0);
    const overReserving = totalSelected > item.meters_required + 0.001;
    // Hard cap: total reserved (existing + this action) may not exceed required +10%.
    const fabricMaxReservable = Math.max(0, (item.meters_required || 0) * (1 + RESERVE_OVER_LIMIT_PCT) - (item.meters_reserved || 0));
    const overFabricCap       = totalSelected > fabricMaxReservable + 0.001;

    // ── Trim: what stock does the currently-selected source actually have? ──
    const trimAvailable = useMemo(() => {
        if (item.type !== 'trim') return Infinity;
        if (sourceId === 'exact') return Number(item.exact_variant_stock ?? 0);
        const sub = (item.substitutes || []).find(s => String(s.substitute_variant_id) === sourceId);
        return Number(sub?.in_stock ?? 0);
    }, [item, sourceId]);
    const trimQtyNum  = parseFloat(trimQty) || 0;
    const trimNeeded  = Math.max(0, (item.quantity_required || 0) - (item.quantity_reserved || 0));
    // Hard cap: total reserved (existing + this action) may not exceed required +10%.
    const trimMaxReservable = Math.max(0, (item.quantity_required || 0) * (1 + RESERVE_OVER_LIMIT_PCT) - (item.quantity_reserved || 0));
    const trimOverStock = item.type === 'trim' && trimQtyNum > trimAvailable;
    const trimOverCap   = item.type === 'trim' && trimQtyNum > trimMaxReservable + 0.001;
    const trimOver       = trimOverStock || trimOverCap;

    // ── Fabric: which rolls have been over-reserved past their free meters? ──
    const fabricOverRolls = useMemo(() => {
        if (item.type !== 'fabric') return [];
        const offenders = [];
        for (const roll of (item.available_rolls || [])) {
            const v = parseFloat(rollSel[roll.roll_id] ?? 0);
            const free = parseFloat(roll.free_meters ?? roll.meter ?? 0);
            if (v > free + 0.001) offenders.push({ rollId: roll.roll_id, free, v });
        }
        return offenders;
    }, [item, rollSel]);
    const fabricOver = item.type === 'fabric' && (fabricOverRolls.length > 0 || overFabricCap);

    // ── Fabric: filter rolls by roll ID or meters (total/free) ──────────────
    const filteredRolls = useMemo(() => {
        const rolls = item.available_rolls || [];
        const q = rollSearch.trim().toLowerCase();
        if (!q) return rolls;
        return rolls.filter(roll => {
            const id      = String(roll.roll_id ?? '').toLowerCase();
            const total   = parseFloat(roll.meter ?? roll.total_meter ?? 0);
            const free    = parseFloat(roll.free_meters ?? roll.meter ?? 0);
            return id.includes(q)
                || `r-${id}`.includes(q)
                || total.toFixed(2).includes(q)
                || free.toFixed(2).includes(q);
        });
    }, [item, rollSearch]);

    const handleConfirm = async () => {
        setBusy(true); setErr(null);
        try {
            if (item.type === 'fabric') {
                const entries = Object.entries(rollSel).filter(([, v]) => parseFloat(v) > 0);
                if (entries.length === 0) { setErr('Select at least one roll and enter meters'); setBusy(false); return; }
                if (fabricOverRolls.length > 0) {
                    setErr('One or more rolls exceed available meters. Reduce before saving.');
                    setBusy(false);
                    return;
                }
                if (overFabricCap) {
                    setErr(`Cannot reserve ${totalSelected.toFixed(2)} m — max reservable is ${fabricMaxReservable.toFixed(2)} m (required +${RESERVE_OVER_LIMIT_PCT * 100}%).`);
                    setBusy(false);
                    return;
                }
                for (const [rollId, v] of entries) {
                    await planningApi.reserveFabric(item.req_id, {
                        fabric_roll_id:  parseInt(rollId),
                        meters_reserved: parseFloat(v),
                    });
                }
            } else if (item.type === 'trim') {
                const q = parseFloat(trimQty);
                if (!q || q <= 0) { setErr('Enter a quantity greater than 0'); setBusy(false); return; }
                if (q > trimAvailable) {
                    setErr(`Only ${trimAvailable.toLocaleString()} ${item.unit} available from the selected source.`);
                    setBusy(false);
                    return;
                }
                if (q > trimMaxReservable + 0.001) {
                    setErr(`Cannot reserve ${q.toLocaleString()} ${item.unit} — max reservable is ${trimMaxReservable.toLocaleString()} ${item.unit} (required +${RESERVE_OVER_LIMIT_PCT * 100}%).`);
                    setBusy(false);
                    return;
                }
                const body = { quantity_reserved: q };
                if (sourceId !== 'exact') body.trim_item_variant_id = parseInt(sourceId);
                else if (item.exact_variant_id) body.trim_item_variant_id = parseInt(item.exact_variant_id);
                await planningApi.reserveTrim(item.req_id, body);
            }
            onDone();
        } catch(e) { setErr(e?.response?.data?.error || e?.response?.data?.message || 'Failed to reserve'); }
        finally { setBusy(false); }
    };

    return (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="px-5 py-4 border-b border-slate-100 shrink-0">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        {item.type === 'fabric' ? 'Reserve Fabric Rolls' : 'Fulfil Trim Requirement'}
                    </p>
                    <p className="text-sm font-bold text-slate-800 mt-0.5">{item.title}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{item.subtitle}</p>
                </div>

                <div className="flex-1 overflow-y-auto p-5 space-y-4">

                    {/* ── FABRIC ────────────────────────────────────────────── */}
                    {item.type === 'fabric' && (<>
                        {/* Stock summary */}
                        <div className="grid grid-cols-3 gap-2 text-center bg-slate-50 rounded-xl p-3">
                            <div>
                                <p className="text-[8px] font-bold text-slate-400 uppercase">Required</p>
                                <p className="text-sm font-bold text-slate-700">{item.meters_required.toFixed(2)} m</p>
                            </div>
                            <div>
                                <p className="text-[8px] font-bold text-slate-400 uppercase">Already Reserved</p>
                                <p className="text-sm font-bold text-slate-700">{(item.meters_reserved || 0).toFixed(2)} m</p>
                            </div>
                            <div>
                                <p className="text-[8px] font-bold text-slate-400 uppercase">{item.inStock ? 'Available' : 'Short'}</p>
                                <p className={`text-sm font-bold ${item.inStock ? 'text-emerald-600' : 'text-red-500'}`}>
                                    {item.meters_available.toFixed(2)} m
                                </p>
                            </div>
                        </div>

                        {/* Roll selection */}
                        {item.available_rolls.length === 0 ? (
                            <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                                No rolls in stock — record a fabric intake first.
                            </p>
                        ) : (
                            <div>
                                <div className="flex items-center justify-between gap-2 mb-2">
                                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                                        Select Rolls to Reserve
                                    </p>
                                    <span className="text-[9px] text-slate-400 font-medium">
                                        {filteredRolls.length} of {item.available_rolls.length}
                                    </span>
                                </div>
                                <div className="relative mb-2">
                                    <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                                    <input
                                        type="text"
                                        value={rollSearch}
                                        onChange={e => setRollSearch(e.target.value)}
                                        placeholder="Search rolls by ID or meters…"
                                        className="w-full text-xs border border-slate-200 rounded-lg pl-8 pr-7 py-1.5 focus:outline-none focus:border-violet-400 bg-white"
                                    />
                                    {rollSearch && (
                                        <button
                                            type="button"
                                            onClick={() => setRollSearch('')}
                                            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500"
                                        >
                                            <X size={12} />
                                        </button>
                                    )}
                                </div>
                                {filteredRolls.length === 0 ? (
                                    <p className="text-xs text-slate-400 italic px-1 py-2">No rolls match "{rollSearch}".</p>
                                ) : (
                                <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                                    {filteredRolls.map(roll => {
                                        const free     = parseFloat(roll.free_meters ?? roll.meter ?? 0);
                                        const checked  = roll.roll_id in rollSel;
                                        const metersV  = rollSel[roll.roll_id] ?? '';
                                        return (
                                            <div key={roll.roll_id}
                                                className={`rounded-xl border-2 transition-all ${checked ? 'border-violet-300 bg-violet-50' : 'border-slate-200 bg-slate-50'}`}>
                                                {/* Roll header row */}
                                                <button type="button"
                                                    onClick={() => toggleRoll(roll.roll_id, free)}
                                                    className="w-full flex items-center gap-3 px-3 py-2.5 text-left">
                                                    <span className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-all ${checked ? 'border-violet-500 bg-violet-500' : 'border-slate-300 bg-white'}`}>
                                                        {checked && <CheckCircle2 size={10} className="text-white" strokeWidth={3} />}
                                                    </span>
                                                    <span className="font-mono font-bold text-xs text-indigo-600">R-{roll.roll_id}</span>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="truncate">
                                                            {roll.challan_number && <span className="text-[10px] text-slate-400">{roll.challan_number}</span>}
                                                            {roll.supplier_name  && <span className="text-[10px] text-slate-400 ml-1">· {roll.supplier_name}</span>}
                                                        </div>
                                                        {roll.split_from_roll_id && (
                                                            <div
                                                                className="flex items-center gap-1 mt-0.5"
                                                                title={`Split from R-${roll.split_from_roll_id} (bale ${roll.split_from_bale_no ?? '—'}): ${parseFloat(roll.split_meters_before ?? 0).toFixed(2)} m before → ${parseFloat(roll.split_meters_committed ?? 0).toFixed(2)} m kept there, ${parseFloat(roll.split_meters_leftover ?? 0).toFixed(2)} m came here${roll.split_at ? ` on ${new Date(roll.split_at).toLocaleDateString()}` : ''}.`}
                                                            >
                                                                <Link2 size={9} className="text-violet-400 shrink-0" />
                                                                <span className="text-[9px] text-violet-500 font-semibold truncate">
                                                                    Split from R-{roll.split_from_roll_id}
                                                                </span>
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="text-right shrink-0">
                                                        <p className="text-[10px] font-bold text-slate-500">
                                                            {parseFloat(roll.meter ?? roll.total_meter ?? 0).toFixed(1)} m total
                                                        </p>
                                                        <p className="text-[10px] font-bold text-emerald-600">
                                                            {free.toFixed(1)} m free
                                                        </p>
                                                    </div>
                                                </button>

                                                {/* Meters input — only when checked */}
                                                {checked && (
                                                    <div className="px-3 pb-2.5 flex items-center gap-2">
                                                        <label className="text-[9px] font-bold text-slate-400 uppercase shrink-0">
                                                            Meters to reserve
                                                        </label>
                                                        <input
                                                            type="number" min="0.01" step="0.01"
                                                            max={free}
                                                            value={metersV}
                                                            onChange={e => setRollMeters(roll.roll_id, e.target.value)}
                                                            className="flex-1 text-xs border border-violet-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-violet-400 bg-white font-bold text-slate-800"
                                                        />
                                                        <span className="text-[10px] text-slate-400 shrink-0">m</span>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                                )}

                                {/* Running total */}
                                <div className={`mt-3 flex items-center justify-between px-3 py-2 rounded-lg text-xs font-bold ${
                                    overFabricCap
                                        ? 'bg-red-50 border border-red-200 text-red-700'
                                        : overReserving
                                            ? 'bg-amber-50 border border-amber-200 text-amber-700'
                                            : totalSelected >= needed - 0.001
                                                ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
                                                : 'bg-slate-50 border border-slate-200 text-slate-600'
                                }`}>
                                    <span>Selected total</span>
                                    <span>{totalSelected.toFixed(2)} m
                                        {overFabricCap
                                            ? <span className="ml-1 font-normal text-red-600">· exceeds max reservable ({fabricMaxReservable.toFixed(2)} m)</span>
                                            : overReserving
                                                ? <span className="ml-1 font-normal text-amber-600">· exceeds requirement</span>
                                                : needed > 0
                                                    ? <span className="ml-1 font-normal opacity-70">of {needed.toFixed(2)} m needed</span>
                                                    : null
                                        }
                                    </span>
                                </div>
                                <p className="mt-1 text-[10px] text-slate-400">
                                    Max reservable: {fabricMaxReservable.toFixed(2)} m (required +{RESERVE_OVER_LIMIT_PCT * 100}%)
                                </p>

                                {fabricOverRolls.length > 0 && (
                                    <p className="mt-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 font-semibold">
                                        {fabricOverRolls.length} roll{fabricOverRolls.length === 1 ? '' : 's'} exceed{fabricOverRolls.length === 1 ? 's' : ''} available meters — reduce before saving.
                                    </p>
                                )}
                            </div>
                        )}
                    </>)}

                    {/* ── TRIM ──────────────────────────────────────────────── */}
                    {item.type === 'trim' && (<>
                        <div className="grid grid-cols-3 gap-2 text-center bg-slate-50 rounded-xl p-3">
                            <div>
                                <p className="text-[8px] font-bold text-slate-400 uppercase">Required</p>
                                <p className="text-sm font-bold text-slate-700">{item.quantity_required.toLocaleString()} {item.unit}</p>
                            </div>
                            <div>
                                <p className="text-[8px] font-bold text-slate-400 uppercase">Reserved</p>
                                <p className="text-sm font-bold text-slate-700">{item.quantity_reserved.toLocaleString()} {item.unit}</p>
                            </div>
                            <div>
                                <p className="text-[8px] font-bold text-slate-400 uppercase">Still Needed</p>
                                <p className={`text-sm font-bold ${item.inStock ? 'text-emerald-600' : 'text-red-500'}`}>
                                    {item.inStock
                                        ? '✓ Fulfilled'
                                        : `${(item.quantity_required - item.quantity_reserved).toLocaleString()} ${item.unit}`}
                                </p>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Reserve From</p>
                            <label className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${sourceId === 'exact' ? 'border-violet-400 bg-violet-50' : 'border-slate-200 hover:border-slate-300'}`}>
                                <input type="radio" name="src" value="exact" checked={sourceId === 'exact'} onChange={() => setSourceId('exact')} className="sr-only" />
                                <span className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${sourceId === 'exact' ? 'border-violet-500 bg-violet-500' : 'border-slate-300'}`}>
                                    {sourceId === 'exact' && <span className="w-1.5 h-1.5 bg-white rounded-full" />}
                                </span>
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs font-bold text-slate-700 truncate">{item.title}</p>
                                    <p className="text-[10px] text-slate-400">Exact match</p>
                                </div>
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${(item.exact_variant_stock ?? 0) > 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'}`}>
                                    {item.exact_variant_stock != null ? `${item.exact_variant_stock.toLocaleString()} in stock` : 'Unknown'}
                                </span>
                            </label>
                            {item.substitutes.length === 0 && (
                                <p className="text-xs text-slate-400 italic px-1">No substitutes configured for this variant.</p>
                            )}
                            {item.substitutes.map(s => {
                                const sid = String(s.substitute_variant_id);

                                return (
                                    <label key={sid} className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${sourceId === sid ? 'border-violet-400 bg-violet-50' : 'border-slate-200 hover:border-slate-300'}`}>
                                        <input type="radio" name="src" value={sid} checked={sourceId === sid} onChange={() => setSourceId(sid)} className="sr-only" />
                                        <span className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${sourceId === sid ? 'border-violet-500 bg-violet-500' : 'border-slate-300'}`}>
                                            {sourceId === sid && <span className="w-1.5 h-1.5 bg-white rounded-full" />}
                                        </span>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs font-bold text-slate-700 truncate">
                                                {s.item_name}{s.color_name ? ` – ${s.color_name}` : ''}{s.color_number ? ` (${s.color_number})` : ''}
                                            </p>
                                            <p className="text-[10px] text-slate-400">Substitute</p>
                                        </div>
                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${s.in_stock > 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
                                            {s.in_stock != null ? `${s.in_stock.toLocaleString()} in stock` : '—'}
                                        </span>
                                    </label>
                                );
                            })}
                        </div>

                        <div>
                            <div className="flex items-center justify-between mb-1">
                                <label className="text-[9px] font-bold text-slate-400 uppercase">
                                    Quantity to Reserve ({item.unit})
                                </label>
                                <div className="flex items-center gap-1.5">
                                    {trimNeeded > 0 && (
                                        <button
                                            type="button"
                                            onClick={() => setTrimQty(String(Math.min(trimNeeded, Number.isFinite(trimAvailable) ? trimAvailable : trimNeeded)))}
                                            className="text-[9px] font-bold text-violet-600 bg-violet-50 hover:bg-violet-100 border border-violet-200 rounded-full px-2 py-0.5 transition-colors"
                                        >
                                            Fill needed ({trimNeeded.toLocaleString()})
                                        </button>
                                    )}
                                    {Number.isFinite(trimAvailable) && trimAvailable > 0 && trimAvailable < trimNeeded && (
                                        <button
                                            type="button"
                                            onClick={() => setTrimQty(String(trimAvailable))}
                                            className="text-[9px] font-bold text-slate-500 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-full px-2 py-0.5 transition-colors"
                                        >
                                            Max in stock ({trimAvailable.toLocaleString()})
                                        </button>
                                    )}
                                </div>
                            </div>
                            <input
                                type="number" min={0} step="any"
                                value={trimQty} onChange={e => setTrimQty(e.target.value)}
                                placeholder={`0 – ${trimNeeded.toLocaleString()} ${item.unit}`}
                                className={`w-full text-sm border rounded-lg px-3 py-2 focus:outline-none ${trimOver ? 'border-red-300 focus:border-red-400 bg-red-50/40' : 'border-slate-200 focus:border-violet-400'}`}
                            />
                            <p className="text-[10px] text-slate-400 mt-1">
                                Up to {trimNeeded.toLocaleString()} {item.unit} needed
                                {Number.isFinite(trimAvailable) && (trimAvailable >= trimNeeded
                                    ? <span className="text-emerald-600"> · enough in stock</span>
                                    : <span className="text-amber-600"> · only {trimAvailable.toLocaleString()} in stock</span>
                                )}
                                {' · '}max {trimMaxReservable.toLocaleString()} reservable (required +{RESERVE_OVER_LIMIT_PCT * 100}%)
                            </p>
                            {trimOverStock && (
                                <p className="text-[11px] text-red-600 mt-1 font-semibold">
                                    Cannot reserve {trimQtyNum.toLocaleString()} {item.unit} — only {trimAvailable.toLocaleString()} available from the selected source.
                                </p>
                            )}
                            {!trimOverStock && trimOverCap && (
                                <p className="text-[11px] text-red-600 mt-1 font-semibold">
                                    Cannot reserve {trimQtyNum.toLocaleString()} {item.unit} — max reservable is {trimMaxReservable.toLocaleString()} {item.unit} (required +{RESERVE_OVER_LIMIT_PCT * 100}%).
                                </p>
                            )}
                        </div>
                    </>)}

                    {err && <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{err}</p>}
                </div>

                <div className="px-5 py-3.5 border-t border-slate-100 flex justify-end gap-2 shrink-0">
                    <button onClick={onClose} className="text-sm text-slate-500 hover:text-slate-700 px-4 py-1.5 rounded-lg hover:bg-slate-100 transition-colors">
                        Cancel
                    </button>
                    <button onClick={handleConfirm}
                        disabled={busy || trimOver || fabricOver}
                        title={trimOverStock
                            ? `Quantity exceeds the ${trimAvailable.toLocaleString()} ${item.unit} available from this source.`
                            : trimOverCap
                                ? `Quantity exceeds the max reservable of ${trimMaxReservable.toLocaleString()} ${item.unit} (required +${RESERVE_OVER_LIMIT_PCT * 100}%).`
                                : fabricOverRolls.length > 0
                                    ? 'One or more rolls exceed available meters.'
                                    : overFabricCap
                                        ? `Selected total exceeds the max reservable of ${fabricMaxReservable.toFixed(2)} m (required +${RESERVE_OVER_LIMIT_PCT * 100}%).`
                                        : undefined}
                        className="flex items-center gap-1.5 text-sm font-bold text-white bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed px-5 py-1.5 rounded-lg transition-colors">
                        {busy && <Loader2 size={13} className="animate-spin" />}
                        Reserve & Mark Complete
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ReserveFulfillModal;

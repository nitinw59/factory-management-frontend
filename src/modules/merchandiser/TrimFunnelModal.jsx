// ─── TRIM FUNNEL MODAL ──────────────────────────────────────────────────────────
// Bulk-fill wizard for a trim item that can be covered by one substitute/stock
// source across multiple colors at once: Step 1 pick the source variant, Step 2
// allocate quantity per covered color (with per-row exclude toggles), then
// Reserve or Raise PR for the selected set. Opened from the trim grid's
// Actions-column bulk-fill button (see TrimRequirementsGrid).
//
// Note: the original version of this modal also had a "Calendar" tab (a T&A
// timeline Gantt view). That's dropped here — T&A timeline UI is out of scope
// for this rewrite — leaving just the funnel wizard itself.

import { useState } from 'react';
import { ChevronRight, Loader2, X } from 'lucide-react';
import { planningApi } from '../../api/planningApi';
import { purchaseDeptApi } from '../../api/purchaseDeptApi';

const TrimFunnelModal = ({ group, sop, onClose, onDone }) => {
    const [step,           setStep]           = useState(1);
    const [pickedVariantId, setPickedVariantId] = useState(null);
    const [allocations,    setAllocations]    = useState({});
    const [excluded,       setExcluded]       = useState(new Set());
    const [busy,           setBusy]           = useState(false);
    const [err,            setErr]            = useState(null);

    // ── Funnel derived values ──
    const pickedSub     = group.commonSubstitutes.find(s => Number(s.substitute_variant_id) === Number(pickedVariantId)) ?? null;
    const coveredIds    = pickedSub ? new Set(pickedSub.matches_req_ids) : new Set();
    const pendingReqs   = group.requirements.filter(r => !r.is_fulfilled && coveredIds.has(r.id));
    const uncoveredReqs = group.requirements.filter(r => !r.is_fulfilled && !coveredIds.has(r.id));

    const handlePickVariant = (sid) => {
        setPickedVariantId(sid);
        const sub     = group.commonSubstitutes.find(s => Number(s.substitute_variant_id) === sid);
        const covered = sub ? new Set(sub.matches_req_ids) : new Set();
        const allocs  = {};
        group.requirements.forEach(r => {
            if (!r.is_fulfilled && covered.has(r.id)) {
                const pending = Math.max(0, Number(r.quantity_required || 0) - Number(r.quantity_reserved || 0));
                allocs[r.id] = String(pending);
            }
        });
        setAllocations(allocs);
        setExcluded(new Set());
        setErr(null);
    };

    const activeReqs    = pendingReqs.filter(r => !excluded.has(r.id));
    const totalSelected = activeReqs.reduce((s, r) => {
        const v = parseFloat(allocations[r.id] ?? 0);
        return s + (Number.isFinite(v) ? v : 0);
    }, 0);
    const inStock   = Number(pickedSub?.in_stock ?? 0);
    const overStock = inStock > 0 && totalSelected > inStock;

    const handleReserve = async () => {
        setBusy(true); setErr(null);
        try {
            for (const r of activeReqs) {
                const qty = parseFloat(allocations[r.id] ?? 0);
                if (!qty || qty <= 0) continue;
                await planningApi.reserveTrim(r.id, {
                    quantity_reserved:    qty,
                    trim_item_variant_id: parseInt(pickedVariantId, 10),
                });
            }
            onDone(); onClose();
        } catch (e) {
            setErr(e?.response?.data?.error || e?.response?.data?.message || 'Reserve failed.');
        } finally { setBusy(false); }
    };

    const handleRaisePR = async () => {
        setBusy(true); setErr(null);
        try {
            for (const r of activeReqs) {
                const qty = parseFloat(allocations[r.id] ?? 0);
                if (!qty || qty <= 0) continue;
                await purchaseDeptApi.raiseRequirement({
                    sales_order_product_id:   sop.id,
                    type:                     'trim',
                    urgency:                  'normal',
                    notes:                    `Bulk raised for ${group.trim_item_name}`,
                    quantity_required:        qty,
                    unit_of_measure:          r.unit_of_measure,
                    trim_item_id:             r.trim_item_id,
                    trim_item_variant_id:     parseInt(pickedVariantId, 10),
                    plan_trim_requirement_id: r.id,
                });
            }
            onDone(); onClose();
        } catch (e) {
            setErr(e?.response?.data?.error || e?.response?.data?.message || 'Raise PR failed.');
        } finally { setBusy(false); }
    };

    return (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4" onClick={onClose}>
            <div
                className="bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden"
                style={{ maxHeight: '85vh', width: '512px', maxWidth: '95vw' }}
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-start justify-between px-5 py-4 border-b border-slate-100 shrink-0">
                    <div>
                        <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wider">
                            Trim Funnel · Step {step} of 2
                        </p>
                        <h3 className="font-extrabold text-slate-800 text-base mt-0.5">{group.trim_item_name}</h3>
                        {group.item_code && <p className="text-[10px] font-mono text-slate-400">{group.item_code}</p>}
                        <p className="text-xs text-slate-500 mt-1">
                            {group.requirements.length} colors
                            {' · '}<span className="text-emerald-600 font-bold">{group.fulfilled} fulfilled</span>
                            {' · '}<span className="text-amber-600 font-bold">{group.pendingCount} pending</span>
                            {' · '}{group.totalRequired.toLocaleString()} {group.unit} total
                        </p>
                    </div>
                    <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg shrink-0 mt-0.5">
                        <X size={15} />
                    </button>
                </div>

                {/* Step indicator */}
                <div className="flex items-center gap-2 px-5 pt-3 pb-1 shrink-0">
                    {[{ n: 1, label: 'Pick Variant' }, { n: 2, label: 'Allocate Colors' }].map(({ n, label }, i, arr) => (
                        <div key={n} className="flex items-center gap-2">
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold border-2 transition-colors ${
                                step === n ? 'border-amber-500 bg-amber-500 text-white'
                                : step > n  ? 'border-emerald-500 bg-emerald-500 text-white'
                                : 'border-slate-200 bg-white text-slate-400'
                            }`}>
                                {step > n ? '✓' : n}
                            </div>
                            <span className={`text-[10px] font-bold ${step === n ? 'text-amber-600' : step > n ? 'text-emerald-600' : 'text-slate-400'}`}>
                                {label}
                            </span>
                            {i < arr.length - 1 && <ChevronRight size={12} className="text-slate-300" />}
                        </div>
                    ))}
                </div>

                {/* Funnel body */}
                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">

                    {/* Step 1: Pick substitute variant */}
                    {step === 1 && (
                        <>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                Available substitutes — each covers ≥2 colors in this group
                            </p>
                            {group.commonSubstitutes.map(s => {
                                const sid       = Number(s.substitute_variant_id);
                                const sel       = pickedVariantId === sid;
                                const coversAll = s.matches_count >= group.requirements.length;
                                return (
                                    <button
                                        key={sid}
                                        onClick={() => handlePickVariant(sid)}
                                        className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl border-2 text-left transition-all ${
                                            sel ? 'border-amber-400 bg-amber-50' : 'border-slate-200 bg-white hover:border-amber-200 hover:bg-amber-50/30'
                                        }`}
                                    >
                                        <div className={`w-4 h-4 rounded-full border-2 shrink-0 transition-colors ${sel ? 'border-amber-500 bg-amber-500' : 'border-slate-300'}`} />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-bold text-slate-800 truncate">
                                                {s.item_name}{s.color_name ? ` – ${s.color_name}` : ''}{s.color_number ? ` (${s.color_number})` : ''}
                                            </p>
                                            <p className="text-[10px] text-slate-500 mt-0.5">
                                                Variant #{sid}{s.variant_size ? ` · Size ${s.variant_size}` : ''}
                                            </p>
                                        </div>
                                        <div className="flex flex-col items-end gap-1 shrink-0">
                                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${coversAll ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>
                                                {s.matches_count}/{group.requirements.length} colors
                                            </span>
                                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${(s.in_stock ?? 0) > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
                                                {s.in_stock != null ? `${Number(s.in_stock).toLocaleString()} in stock` : 'No stock data'}
                                            </span>
                                        </div>
                                    </button>
                                );
                            })}
                        </>
                    )}

                    {/* Step 2: Per-color allocation */}
                    {step === 2 && pickedSub && (
                        <>
                            <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs font-bold text-amber-800 truncate">
                                        {pickedSub.item_name}{pickedSub.color_name ? ` – ${pickedSub.color_name}` : ''}{pickedSub.color_number ? ` (${pickedSub.color_number})` : ''}
                                    </p>
                                    <p className="text-[10px] text-amber-600">
                                        Variant #{Number(pickedVariantId)} · {inStock.toLocaleString()} {group.unit} in stock
                                    </p>
                                </div>
                                <button
                                    onClick={() => { setStep(1); setPickedVariantId(null); setErr(null); }}
                                    className="text-[10px] font-bold text-amber-600 hover:text-amber-800 underline shrink-0"
                                >Change</button>
                            </div>

                            <div className={`flex items-center justify-between rounded-xl px-3 py-2.5 border ${overStock ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-200'}`}>
                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Total qty selected</span>
                                <span className={`text-sm font-extrabold tabular-nums ${overStock ? 'text-red-600' : 'text-slate-800'}`}>
                                    {totalSelected.toLocaleString()} / {inStock.toLocaleString()} {group.unit}
                                    {overStock && <span className="ml-1.5 text-[10px] text-red-500">⚠ over stock</span>}
                                </span>
                            </div>

                            <div>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                                    Covered colors ({pendingReqs.length})
                                </p>
                                <div className="space-y-2">
                                    {pendingReqs.map(r => {
                                        const isExcluded = excluded.has(r.id);
                                        const pending    = Math.max(0, Number(r.quantity_required || 0) - Number(r.quantity_reserved || 0));
                                        const allocVal   = allocations[r.id] ?? String(pending);
                                        return (
                                            <div key={r.id} className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-all ${isExcluded ? 'bg-slate-50 border-slate-200 opacity-50' : 'bg-white border-slate-200'}`}>
                                                <button
                                                    type="button"
                                                    onClick={() => setExcluded(s => { const n = new Set(s); n.has(r.id) ? n.delete(r.id) : n.add(r.id); return n; })}
                                                    className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${isExcluded ? 'border-slate-300 bg-white' : 'border-amber-500 bg-amber-500'}`}
                                                >
                                                    {!isExcluded && <span className="text-white text-[8px] font-bold leading-none">✓</span>}
                                                </button>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-xs font-bold text-slate-700 truncate">
                                                        {r.color_name || `Req #${r.id}`}
                                                        {r.color_number && <span className="font-mono text-slate-400 ml-1.5 text-[10px]">#{r.color_number}</span>}
                                                    </p>
                                                    <p className="text-[9px] text-slate-400">
                                                        {Number(r.quantity_reserved || 0).toLocaleString()} / {Number(r.quantity_required || 0).toLocaleString()} {group.unit} reserved
                                                    </p>
                                                </div>
                                                <div className="flex items-center gap-1.5 shrink-0">
                                                    <input
                                                        type="number" min={0} step="any" disabled={isExcluded}
                                                        value={allocVal}
                                                        onChange={e => setAllocations(a => ({ ...a, [r.id]: e.target.value }))}
                                                        className="w-20 text-xs text-right border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-amber-400 disabled:bg-slate-50 disabled:text-slate-300"
                                                    />
                                                    <span className="text-[10px] text-slate-400 w-6 shrink-0">{group.unit}</span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {uncoveredReqs.length > 0 && (
                                <div>
                                    <p className="text-[10px] font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                                        Not covered by this variant ({uncoveredReqs.length}) — reserve individually from its own cell
                                    </p>
                                    <div className="space-y-1">
                                        {uncoveredReqs.map(r => (
                                            <div key={r.id} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-50 opacity-60">
                                                <span className="w-1.5 h-1.5 rounded-full bg-slate-300 shrink-0" />
                                                <p className="text-[10px] text-slate-500 truncate">
                                                    {r.color_name || `Req #${r.id}`}
                                                    {r.color_number ? ` · #${r.color_number}` : ''}
                                                    {' · '}{Math.max(0, Number(r.quantity_required || 0) - Number(r.quantity_reserved || 0)).toLocaleString()} {group.unit} pending
                                                </p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>

                {err && <p className="px-5 pb-2 text-xs text-red-600 font-semibold shrink-0">{err}</p>}

                {/* Footer */}
                <div className="flex items-center justify-between gap-3 px-5 py-4 border-t border-slate-100 bg-slate-50/50 shrink-0">
                    <button onClick={onClose} className="text-sm text-slate-500 hover:text-slate-700 font-medium">Cancel</button>
                    {step === 1 ? (
                        <button
                            onClick={() => setStep(2)}
                            disabled={!pickedVariantId}
                            className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-white text-sm font-bold rounded-xl hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                            Next: Allocate <ChevronRight size={14} />
                        </button>
                    ) : (
                        <div className="flex items-center gap-2">
                            <button
                                onClick={handleRaisePR}
                                disabled={busy || activeReqs.length === 0}
                                className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white text-xs font-bold rounded-xl hover:bg-blue-700 disabled:opacity-40 transition-colors"
                            >
                                {busy && <Loader2 size={12} className="animate-spin" />}
                                Raise PR ({activeReqs.length})
                            </button>
                            <button
                                onClick={handleReserve}
                                disabled={busy || activeReqs.length === 0 || overStock}
                                title={overStock ? `${totalSelected.toLocaleString()} selected exceeds ${inStock.toLocaleString()} in stock` : undefined}
                                className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 text-white text-xs font-bold rounded-xl hover:bg-emerald-700 disabled:opacity-40 transition-colors"
                            >
                                {busy && <Loader2 size={12} className="animate-spin" />}
                                Reserve ({activeReqs.length})
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default TrimFunnelModal;

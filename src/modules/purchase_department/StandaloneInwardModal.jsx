import { useState, useEffect, useMemo, useCallback } from 'react';
import {
    X, Loader2, Plus, Trash2, Package, Scissors, Wrench, Tag, Upload,
    FileText, AlertTriangle, CheckCircle2, Boxes,
    ClipboardList, ArrowRight, ArrowLeft, PackagePlus,
    IndianRupee, Calculator,
} from 'lucide-react';
import BoxBreakdownModal from './BoxBreakdownModal';
import { purchaseDeptApi } from '../../api/purchaseDeptApi';
import { storeManagerApi } from '../../api/storeManagerApi';
import { trimsApi } from '../../api/trimsApi';
import { sparesApi } from '../../api/sparesApi';
import { generalItemsApi } from '../../api/generalItemsApi';
import { newRoll, sumRolls, mapRolls, rk, sumTrimBoxes, mapTrimBoxes, UOM_OPTIONS, uomLabel, seedLinesFromInward, describeEditBlock } from './inwardShared';
import InwardCreateModal from './InwardCreateModal';
import InwardReviewModal from './InwardReviewModal';
import SearchableSelect from '../../shared/SearchableSelect';

// ── Helpers ───────────────────────────────────────────────────────────────────

const TYPES = [
    { key: 'fabric', label: 'Fabric',    icon: Package  },
    { key: 'trim',   label: 'Trim',      icon: Scissors },
    { key: 'spare',  label: 'Spare',     icon: Wrench   },
    { key: 'other',  label: 'Other',     icon: Tag      },
];

const CONDITIONS = ['GOOD', 'DAMAGED', 'PARTIAL'];

// Approval states a just-created inward can come back in. Keys and palette match
// STATUS_CFG in InwardsPage, which is where the user lands next.
const STATUS_CFG = {
    PENDING_APPROVAL: {
        label:  'Pending',
        pill:   'bg-amber-100 text-amber-700 border-amber-200',
        banner: 'bg-amber-50 border-amber-200 text-amber-800',
        note:   'Pending purchase-manager approval — stock will be applied once approved.',
    },
    APPROVED: {
        label:  'Approved',
        pill:   'bg-emerald-100 text-emerald-700 border-emerald-200',
        banner: 'bg-emerald-50 border-emerald-200 text-emerald-800',
        note:   'Approved — stock has been applied.',
    },
    REJECTED: {
        label:  'Rejected',
        pill:   'bg-rose-100 text-rose-700 border-rose-200',
        banner: 'bg-rose-50 border-rose-200 text-rose-800',
        note:   'Rejected — no stock was applied.',
    },
    // Not reachable against the current backend — see docs/purchase-department/
    // edit-inward-backend-spec.md. Kept here so the success screen is ready
    // once that ships instead of falling back to the PENDING_APPROVAL copy.
    PENDING_UPDATE: {
        label:  'Edit pending',
        pill:   'bg-blue-100 text-blue-700 border-blue-200',
        banner: 'bg-blue-50 border-blue-200 text-blue-800',
        note:   'Edit submitted — the original approved record and its stock remain untouched until a purchase-manager reviews this change.',
    },
};

// Variants from storeManagerApi.getVariantsByTrimItem use `variant_id` (NOT `id`) and carry
// color_number/color_name/variant_size (see ExchangePanel which reads the same endpoint).
// Build the label from those; fall back to any explicit name, then the id.
const variantIdOf = (v) => v.variant_id ?? v.id;
const variantLabel = (v) => {
    const parts = [];
    if (v.color_number) parts.push(v.color_number);
    if (v.color_name)   parts.push(v.color_name);
    if (v.variant_size) parts.push(`Sz ${v.variant_size}`);
    return parts.join(' · ') || v.name || v.variant_name || `Variant #${variantIdOf(v)}`;
};

const emptyLine = (type = 'trim') => ({
    _k:                  rk(),
    type,
    // fabric
    fabric_type_id:      '',
    fabric_color_id:     '',
    rolls:               [newRoll()],
    // trim
    trim_item_id:        '',
    trim_item_variant_id:'',
    qty:                 '',
    // spare
    spare_part_id:       '',
    spare_qty:           '',
    // other (general item)
    general_item_id:     '',
    description:         '',   // optional notes
    other_qty:           '',
    uom:                 'pcs',
    // shared
    unit_price:          '',
});

// ── Roll row editor ───────────────────────────────────────────────────────────

function RollRow({ roll, onChange, onRemove, removable }) {
    return (
        <div className="flex items-center gap-2">
            <input
                type="text"
                placeholder="Bale #"
                value={roll.bale_no}
                onChange={e => onChange({ ...roll, bale_no: e.target.value })}
                className="w-24 text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-violet-400"
            />
            <input
                type="number"
                min="0.01"
                step="0.01"
                placeholder="Qty"
                value={roll.meter}
                onChange={e => onChange({ ...roll, meter: e.target.value })}
                className="w-24 text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-violet-400 tabular-nums"
            />
            <select
                value={roll.uom}
                onChange={e => onChange({ ...roll, uom: e.target.value })}
                className="w-16 text-xs border border-slate-200 rounded-lg px-1 py-1.5 bg-white focus:outline-none focus:border-violet-400"
            >
                {UOM_OPTIONS.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
            </select>
            {removable && (
                <button
                    type="button"
                    onClick={onRemove}
                    className="p-1 text-slate-300 hover:text-red-500 rounded transition"
                >
                    <Trash2 size={12} />
                </button>
            )}
        </div>
    );
}

// ── Unit price field ──────────────────────────────────────────────────────────

// Box rate ÷ qty-per-box rarely divides evenly (e.g. ₹1000 / 300 pcs = ₹3.33333…) —
// keep up to 5 decimal places so the rounding error doesn't compound across a
// large quantity, but trim trailing zeros so simple divisions still read clean.
const formatPricePrecise = (n) => {
    if (n == null || Number.isNaN(n)) return null;
    return n.toFixed(5).replace(/0+$/, '').replace(/\.$/, '');
};

// Line amount = qty × unit price. unit_price can carry up to 5 decimals (the
// box-rate calculator), and multiplying that by a large qty means the total
// itself is rarely a clean 2dp number — cap at 5dp like the rate, not 2, or
// the display rounds away the very precision the calculator was for. Always
// show at least 2dp so a whole-rupee amount still reads as a currency value.
const formatMoney = (n) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 5 });
const lineAmount = (l) => {
    const price = parseFloat(l.unit_price);
    if (!Number.isFinite(price) || price <= 0) return null;
    return (Number(l.qty) || 0) * price;
};

// Highlighted so it doesn't get skipped like a throwaway "optional" input, plus
// a "Box rate" mini-calculator: type what a whole box costs and how many units
// are in it, and it divides that down to a per-unit price for you.
function UnitPriceField({ value, onChange, unitLabel = 'unit', wide }) {
    const [calcOpen,   setCalcOpen]   = useState(false);
    const [boxRate,    setBoxRate]    = useState('');
    const [qtyPerBox,  setQtyPerBox]  = useState('');
    const computed = (parseFloat(boxRate) > 0 && parseFloat(qtyPerBox) > 0)
        ? parseFloat(boxRate) / parseFloat(qtyPerBox)
        : null;

    return (
        <div className={wide ? 'w-40' : ''}>
            <label className="text-[9px] font-bold text-amber-700 uppercase tracking-wide flex items-center gap-1 mb-1">
                <IndianRupee size={10} /> Unit Price
            </label>
            <div className="flex items-center gap-1.5">
                <input
                    type="number" min="0" step="any" placeholder="0.00"
                    value={value}
                    onChange={e => onChange(e.target.value)}
                    className="flex-1 min-w-0 text-xs font-semibold text-slate-800 border border-amber-300 bg-amber-50/60 rounded-lg px-2 py-1.5 focus:outline-none focus:border-amber-500 tabular-nums"
                />
                <button
                    type="button"
                    onClick={() => setCalcOpen(o => !o)}
                    title="Calculate from a box rate"
                    className={`shrink-0 p-1.5 rounded-lg border transition ${calcOpen ? 'bg-amber-500 text-white border-amber-500' : 'text-amber-600 border-amber-200 hover:bg-amber-50'}`}
                >
                    <Calculator size={12} />
                </button>
            </div>
            {calcOpen && (
                <div className="mt-1.5 flex items-center gap-1.5 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5 flex-wrap">
                    <input
                        type="number" min="0" step="any" placeholder="Box rate ₹"
                        value={boxRate}
                        onChange={e => setBoxRate(e.target.value)}
                        className="w-20 text-[11px] border border-amber-200 rounded px-1.5 py-1 tabular-nums focus:outline-none focus:border-amber-400"
                    />
                    <span className="text-[10px] text-amber-500">÷</span>
                    <input
                        type="number" min="0" step="any" placeholder={`Qty/box`}
                        value={qtyPerBox}
                        onChange={e => setQtyPerBox(e.target.value)}
                        className="w-20 text-[11px] border border-amber-200 rounded px-1.5 py-1 tabular-nums focus:outline-none focus:border-amber-400"
                    />
                    <span className="text-[10px] font-bold text-amber-800 flex-1 text-right whitespace-nowrap">
                        {computed != null ? `= ₹${formatPricePrecise(computed)}/${unitLabel}` : '—'}
                    </span>
                    <button
                        type="button"
                        disabled={computed == null}
                        onClick={() => { onChange(formatPricePrecise(computed)); setCalcOpen(false); setBoxRate(''); setQtyPerBox(''); }}
                        className="text-[10px] font-bold text-white bg-amber-500 hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed px-2 py-1 rounded-md transition"
                    >
                        Use
                    </button>
                </div>
            )}
        </div>
    );
}

// ── Single line-item card ─────────────────────────────────────────────────────

// onPatch(patch) shallow-merges into this line; patch may be an updater fn of the
// current line, which is what async callers must use — a captured `line` would be
// stale by the time a request resolves. onReplace swaps the line wholesale.
function LineCard({ line, fabricTypes, fabricColors, trimItems, spareParts, generalItems, onAddGeneralItem, onOpenBoxes, onPatch, onReplace, onRemove }) {
    const qtyField = line.type === 'trim' ? 'qty' : line.type === 'spare' ? 'spare_qty' : 'other_qty';
    const hasBoxes = (line.boxes || []).length > 0;
    // Box-breakdown control for non-fabric lines (trim/spare/other) — mirrors the PO flow.
    const boxControl = line.type === 'fabric' ? null : (
        <div className="mt-1.5">
            {hasBoxes ? (
                <div className="flex items-center gap-2 flex-wrap bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5">
                    <span className="text-[11px] font-bold text-slate-700 tabular-nums">{sumTrimBoxes(line.boxes).toLocaleString('en-IN')} {line.uom || 'pcs'} via boxes</span>
                    <span className="text-[10px] text-slate-400 font-mono">{line.boxes.map(b => `${b.box_count}×${b.qty_per_box}`).join(' + ')}</span>
                    <button type="button" onClick={() => onOpenBoxes(line)} className="ml-auto text-[10px] font-bold text-violet-600 border border-violet-200 hover:bg-violet-50 px-1.5 py-0.5 rounded">Edit</button>
                    <button type="button" onClick={() => onPatch(l => ({ boxes: [], [qtyField]: sumTrimBoxes(l.boxes) > 0 ? String(sumTrimBoxes(l.boxes)) : '' }))} className="text-[10px] text-slate-400 hover:text-red-500">Remove</button>
                </div>
            ) : (
                <button type="button" onClick={() => onOpenBoxes(line)} className="flex items-center gap-1 text-[10px] font-bold text-violet-600 border border-violet-200 hover:bg-violet-50 px-1.5 py-0.5 rounded transition">
                    <Boxes size={11} /> Box breakdown
                </button>
            )}
        </div>
    );
    const [variantsLoading, setVariantsLoading] = useState(false);

    // Load variants when trim item changes. Patch functionally and ignore stale
    // responses — the user may have edited the line (or switched trim item again)
    // while this request was in flight.
    const trimItemId = line.trim_item_id;
    useEffect(() => {
        if (!trimItemId) return;
        let cancelled = false;
        setVariantsLoading(true);
        storeManagerApi.getVariantsByTrimItem(trimItemId)
            .then(r => {
                if (cancelled) return;
                const variants = r.data?.data || r.data || [];
                // Preserve a variant id that was pre-selected (edit-mode prefill,
                // or the user picked the same trim item again) if it's still
                // valid among the freshly loaded variants; otherwise clear it.
                onPatch(l => ({
                    _variants: variants,
                    trim_item_variant_id: variants.some(v => String(variantIdOf(v)) === String(l.trim_item_variant_id))
                        ? l.trim_item_variant_id
                        : '',
                }));
            })
            .catch(() => { if (!cancelled) onPatch({ _variants: [] }); })
            .finally(() => { if (!cancelled) setVariantsLoading(false); });
        return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [trimItemId]);

    const set = (k, v) => onPatch({ [k]: v });

    const addRoll = () => onPatch(l => ({ rolls: [...l.rolls, newRoll()] }));
    const setRoll = (i, r) => onPatch(l => ({ rolls: l.rolls.map((x, j) => j === i ? r : x) }));
    const removeRoll = (i) => onPatch(l => ({ rolls: l.rolls.filter((_, j) => j !== i) }));

    const rollTotal = sumRolls(line.rolls);
    const rollUoms = [...new Set(line.rolls.map(r => r.uom || 'meter'))];
    const rollUnitLabel = rollUoms.length === 1 ? uomLabel(rollUoms[0]) : 'mixed units';
    const selectedTrimItem = trimItems.find(t => String(t.id) === String(line.trim_item_id));

    return (
        <div className="border border-slate-200 rounded-xl p-3 space-y-3 bg-white">
            {/* Type selector + remove */}
            <div className="flex items-center justify-between gap-2">
                <div className="flex gap-1">
                    {TYPES.map(({ key, label, icon: TIcon }) => (
                        <button
                            key={key}
                            type="button"
                            onClick={() => onReplace({ ...emptyLine(key), _k: line._k })}
                            className={`flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-lg border transition ${
                                line.type === key
                                    ? 'bg-orange-500 text-white border-orange-500'
                                    : 'bg-white text-slate-600 border-slate-200 hover:border-orange-300'
                            }`}
                        >
                            <TIcon size={10} /> {label}
                        </button>
                    ))}
                </div>
                <button type="button" onClick={onRemove} className="p-1 text-slate-300 hover:text-red-500 rounded transition">
                    <Trash2 size={14} />
                </button>
            </div>

            {/* Type-specific fields */}
            {line.type === 'fabric' && (
                <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                        <div>
                            <label className="text-[9px] font-bold text-slate-400 uppercase block mb-1">Fabric Type *</label>
                            <select value={line.fabric_type_id} onChange={e => set('fabric_type_id', e.target.value)}
                                className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-violet-400">
                                <option value="">Select type…</option>
                                {fabricTypes.map(ft => <option key={ft.id} value={ft.id}>{ft.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="text-[9px] font-bold text-slate-400 uppercase block mb-1">Color</label>
                            <select value={line.fabric_color_id} onChange={e => set('fabric_color_id', e.target.value)}
                                className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-violet-400">
                                <option value="">No color</option>
                                {fabricColors.map(fc => <option key={fc.id} value={fc.id}>{fc.name}{fc.color_number ? ` (${fc.color_number})` : ''}</option>)}
                            </select>
                        </div>
                    </div>
                    <div>
                        <label className="text-[9px] font-bold text-slate-400 uppercase block mb-1">
                            Rolls · <span className="normal-case text-emerald-600 font-bold">{rollTotal.toFixed(2)} {rollUnitLabel} total</span>
                        </label>
                        <div className="space-y-1.5">
                            {line.rolls.map((r, i) => (
                                <RollRow
                                    key={r._k}
                                    roll={r}
                                    onChange={nr => setRoll(i, nr)}
                                    onRemove={() => removeRoll(i)}
                                    removable={line.rolls.length > 1}
                                />
                            ))}
                        </div>
                        <button type="button" onClick={addRoll}
                            className="mt-1.5 text-[10px] font-bold text-violet-600 hover:text-violet-800 flex items-center gap-1 transition">
                            <Plus size={10} /> Add roll
                        </button>
                    </div>
                </div>
            )}

            {line.type === 'trim' && (
                <>
                <div className="grid grid-cols-2 gap-2">
                    <div>
                        <label className="text-[9px] font-bold text-slate-400 uppercase block mb-1">Trim Item *</label>
                        <select value={line.trim_item_id} onChange={e => set('trim_item_id', e.target.value)}
                            className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-violet-400">
                            <option value="">Select item…</option>
                            {trimItems.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="text-[9px] font-bold text-slate-400 uppercase block mb-1">
                            Variant * {variantsLoading && <Loader2 size={9} className="inline animate-spin ml-1" />}
                        </label>
                        <select value={line.trim_item_variant_id} onChange={e => set('trim_item_variant_id', e.target.value)}
                            disabled={!line.trim_item_id || variantsLoading}
                            className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-violet-400 disabled:bg-slate-100">
                            <option value="">Select variant…</option>
                            {(line._variants || []).map(v => (
                                <option key={variantIdOf(v)} value={variantIdOf(v)}>{variantLabel(v)}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="text-[9px] font-bold text-slate-400 uppercase block mb-1 flex items-center gap-1.5">
                            Qty *
                            {selectedTrimItem?.unit_of_measure && (
                                <span className="normal-case text-[9px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-100 px-1.5 py-0.5 rounded">
                                    {selectedTrimItem.unit_of_measure}
                                </span>
                            )}
                        </label>
                        <input type="number" min="0.01" step="1" placeholder={hasBoxes ? 'from boxes' : '0'} value={hasBoxes ? sumTrimBoxes(line.boxes) : line.qty} onChange={e => set('qty', e.target.value)}
                            disabled={hasBoxes}
                            className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-violet-400 tabular-nums disabled:bg-slate-100 disabled:text-slate-500" />
                    </div>
                    <UnitPriceField
                        value={line.unit_price}
                        onChange={v => set('unit_price', v)}
                        unitLabel={selectedTrimItem?.unit_of_measure || 'pcs'}
                    />
                </div>
                {boxControl}
                </>
            )}

            {line.type === 'spare' && (
                <>
                <div className="grid grid-cols-2 gap-2">
                    <div className="col-span-2">
                        <label className="text-[9px] font-bold text-slate-400 uppercase block mb-1">Spare Part *</label>
                        <select value={line.spare_part_id} onChange={e => set('spare_part_id', e.target.value)}
                            className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-violet-400">
                            <option value="">Select part…</option>
                            {spareParts.map(s => <option key={s.id} value={s.id}>{s.name}{s.part_number ? ` (${s.part_number})` : ''}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="text-[9px] font-bold text-slate-400 uppercase block mb-1">Qty *</label>
                        <input type="number" min="0.01" step="1" placeholder={hasBoxes ? 'from boxes' : '0'} value={hasBoxes ? sumTrimBoxes(line.boxes) : line.spare_qty} onChange={e => set('spare_qty', e.target.value)}
                            disabled={hasBoxes}
                            className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-violet-400 tabular-nums disabled:bg-slate-100 disabled:text-slate-500" />
                    </div>
                    <UnitPriceField
                        value={line.unit_price}
                        onChange={v => set('unit_price', v)}
                        unitLabel="pcs"
                    />
                </div>
                {boxControl}
                </>
            )}

            {line.type === 'other' && (
                <>
                <div className="grid grid-cols-2 gap-2">
                    <div className="col-span-2">
                        <label className="text-[9px] font-bold text-slate-400 uppercase block mb-1">Item *</label>
                        <div className="flex gap-1.5 items-center">
                            <div className="flex-1">
                                <SearchableSelect
                                    value={line.general_item_id}
                                    onChange={v => set('general_item_id', v)}
                                    options={(generalItems || []).map(i => ({
                                        value: i.id,
                                        label: `${i.name}${i.item_code ? ` (${i.item_code})` : ''}`,
                                    }))}
                                    placeholder="— Select item —"
                                    size="sm"
                                />
                            </div>
                            <button
                                type="button"
                                onClick={() => onAddGeneralItem?.((newItem) => set('general_item_id', newItem.id))}
                                title="Create new general item"
                                className="shrink-0 p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-colors"
                            >
                                <Plus size={12} />
                            </button>
                        </div>
                    </div>
                    <div>
                        <label className="text-[9px] font-bold text-slate-400 uppercase block mb-1">Qty *</label>
                        <input type="number" min="0.01" step="0.01" placeholder={hasBoxes ? 'from boxes' : '0'} value={hasBoxes ? sumTrimBoxes(line.boxes) : line.other_qty} onChange={e => set('other_qty', e.target.value)}
                            disabled={hasBoxes}
                            className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-violet-400 tabular-nums disabled:bg-slate-100 disabled:text-slate-500" />
                    </div>
                    <div>
                        <label className="text-[9px] font-bold text-slate-400 uppercase block mb-1">UoM</label>
                        <input type="text" placeholder="pcs, kg, m…" value={line.uom} onChange={e => set('uom', e.target.value)}
                            className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-violet-400" />
                    </div>
                    <UnitPriceField
                        value={line.unit_price}
                        onChange={v => set('unit_price', v)}
                        unitLabel={line.uom || 'pcs'}
                    />
                    <div className="col-span-2">
                        <label className="text-[9px] font-bold text-slate-400 uppercase block mb-1">Notes (optional)</label>
                        <input type="text" placeholder="Any notes…" value={line.description} onChange={e => set('description', e.target.value)}
                            className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-violet-400" />
                    </div>
                </div>
                {boxControl}
                </>
            )}

            {/* Unit price for fabric (shared row below rolls) */}
            {line.type === 'fabric' && (
                <UnitPriceField
                    value={line.unit_price}
                    onChange={v => set('unit_price', v)}
                    unitLabel={rollUnitLabel}
                    wide
                />
            )}
        </div>
    );
}

// ── Main Modal ────────────────────────────────────────────────────────────────

export default function StandaloneInwardModal({ onClose, onCreated, inward = null }) {
    // First-screen choice: null = chooser, 'po' = PO search, 'standalone' = free-form.
    // Editing an existing standalone inward skips the chooser entirely.
    const [entryMode, setEntryMode] = useState(inward ? 'standalone' : null);
    const isEdit = !!inward;

    // Header fields — prefilled from the inward being edited, if any.
    const [receivedDate, setReceivedDate] = useState(inward?.received_date ? String(inward.received_date).slice(0, 10) : new Date().toISOString().split('T')[0]);
    const [condition,    setCondition]    = useState(inward?.condition || 'GOOD');
    const [notes,        setNotes]        = useState(inward?.notes || '');
    const [scanFile,     setScanFile]     = useState(null);
    const [supplierId,   setSupplierId]   = useState(inward?.supplier_id != null ? String(inward.supplier_id) : '');

    // PO picker
    const [poSearch,     setPoSearch]     = useState('');
    const [poList,       setPoList]       = useState([]);
    const [poListLoading, setPoListLoading] = useState(false);
    const [selectedPo,   setSelectedPo]   = useState(null);
    const [poLoading,    setPoLoading]    = useState(false);

    // PO flow (when a PO is selected)
    const [poStep,  setPoStep]  = useState(null);  // null | 'create' | 'review'
    const [poCtx,   setPoCtx]   = useState(null);  // { po, items, inwards, snapshot, payload }

    // Free-form lines — prefilled from the inward being edited, if any. Trim
    // lines need `trimItems` (loaded async, below) to resolve their parent
    // trim_item_id; re-seeded once that lookup arrives (see effect below).
    const [lines, setLines] = useState(() =>
        inward ? (seedLinesFromInward(inward, { trimItems: [] }) || [emptyLine('trim')]) : [emptyLine('trim')]);
    const [linesReseeded, setLinesReseeded] = useState(!inward);

    // Lookup data
    const [suppliers,     setSuppliers]     = useState([]);
    const [fabricTypes,   setFabricTypes]   = useState([]);
    const [fabricColors,  setFabricColors]  = useState([]);
    const [trimItems,     setTrimItems]     = useState([]);
    const [spareParts,    setSpareParts]    = useState([]);
    const [generalItems,  setGeneralItems]  = useState([]);

    // Quick-create general item
    const [quickCreate,        setQuickCreate]        = useState(null); // null | callback(newItem)
    const [quickCreateName,    setQuickCreateName]    = useState('');
    const [quickCreateCode,    setQuickCreateCode]    = useState('');
    const [quickCreateBusy,    setQuickCreateBusy]    = useState(false);
    const [quickCreateErr,     setQuickCreateErr]     = useState(null);

    // Submit state
    const [saving,  setSaving]  = useState(false);
    const [err,     setErr]     = useState(null);
    const [success, setSuccess] = useState(false);
    const [created, setCreated] = useState(null); // { id, grn, status, received_date, condition, supplier_name, scan_name, lines[] }
    const [boxModal, setBoxModal] = useState(null); // { idx, uom, initialBoxes }
    // Review step — populated by handleReview, consumed by handleConfirmSubmit.
    // Non-null means "show the review screen instead of the line-item form".
    const [reviewData, setReviewData] = useState(null); // { items, summary } | null

    // Load lookup data on mount
    useEffect(() => {
        storeManagerApi.getSuppliers()
            .then(r => setSuppliers(r.data?.data || r.data || []))
            .catch(() => {});
        storeManagerApi.getFabricTypes()
            .then(r => setFabricTypes(r.data?.data || r.data || []))
            .catch(() => {});
        storeManagerApi.getFabricColors()
            .then(r => setFabricColors(r.data?.data || r.data || []))
            .catch(() => {});
        trimsApi.getItems()
            .then(r => setTrimItems(r.data?.data || r.data || []))
            .catch(() => {});
        sparesApi.getAllSpares()
            .then(data => setSpareParts(Array.isArray(data) ? data : (data?.data || [])))
            .catch(() => {});
        generalItemsApi.getItems({ active: true })
            .then(r => setGeneralItems(r.data?.data ?? r.data ?? []))
            .catch(() => {});
    }, []);

    // Edit mode only: trim_item_id couldn't be resolved on first render (before
    // trimItems loaded), so re-seed the lines once it's available. Runs at most
    // once — after that the user owns the lines state.
    useEffect(() => {
        if (linesReseeded || trimItems.length === 0) return;
        setLines(seedLinesFromInward(inward, { trimItems }) || [emptyLine('trim')]);
        setLinesReseeded(true);
    }, [trimItems, linesReseeded, inward]);

    // Load PO list once the user enters the "against a PO" screen
    useEffect(() => {
        if (entryMode !== 'po' || poList.length > 0) return;
        setPoListLoading(true);
        purchaseDeptApi.getOrders()
            .then(r => setPoList(r.data?.data ?? r.data ?? []))
            .catch(() => {})
            .finally(() => setPoListLoading(false));
    }, [entryMode, poList.length]);

    const filteredPos = useMemo(() => {
        const q = poSearch.toLowerCase();
        const active = poList.filter(o => o.status !== 'COMPLETED' && o.status !== 'CANCELLED');
        if (!q) return active.slice(0, 8);
        return active.filter(o =>
            (o.po_code || '').toLowerCase().includes(q) ||
            (o.supplier_name || '').toLowerCase().includes(q) ||
            String(o.id).includes(q)
        ).slice(0, 8);
    }, [poList, poSearch]);

    const handleLoadPo = async () => {
        if (!selectedPo) return;
        // Re-entering a PO we already loaded — keep the in-progress snapshot
        // rather than refetching and wiping what was entered before Back.
        if (poCtx?.po?.id === selectedPo.id) { setPoStep('create'); return; }
        setPoLoading(true); setErr(null);
        try {
            const [poRes, iwRes] = await Promise.all([
                purchaseDeptApi.getOrderById(selectedPo.id),
                purchaseDeptApi.getInwards(selectedPo.id).catch(() => ({ data: [] })),
            ]);
            const po     = poRes.data?.data ?? poRes.data;
            const inwards = iwRes.data?.data ?? iwRes.data ?? [];
            if (!po) throw new Error('Could not load PO.');
            setPoCtx({ po, items: po.items || [], inwards, snapshot: null, payload: null });
            setPoStep('create');
        } catch (e) {
            setErr(e?.response?.data?.error || e.message || 'Failed to load PO.');
        } finally {
            setPoLoading(false);
        }
    };

    const handleQuickCreate = useCallback(async () => {
        if (!quickCreateName.trim()) { setQuickCreateErr('Name is required.'); return; }
        setQuickCreateBusy(true); setQuickCreateErr(null);
        try {
            const res = await generalItemsApi.createItem({
                name: quickCreateName.trim(),
                item_code: quickCreateCode.trim() || undefined,
            });
            const newItem = res.data?.data ?? res.data;
            setGeneralItems(prev => [...prev, newItem]);
            quickCreate?.(newItem);
            setQuickCreate(null); setQuickCreateName(''); setQuickCreateCode('');
        } catch (e) {
            setQuickCreateErr(e?.response?.data?.error || 'Failed to create item.');
        } finally {
            setQuickCreateBusy(false);
        }
    }, [quickCreateName, quickCreateCode, quickCreate]);

    // Validates the current lines and builds both the API payload and a
    // human-readable summary (qty/unit price/amount) shared by the review and
    // success screens. Pure — no side effects, no API call.
    const buildSubmission = () => {
        if (lines.length === 0) return { error: 'Add at least one item.' };
        if (!supplierId) return { error: 'Supplier is required.' };

        const items = [];
        for (const l of lines) {
            if (l.type === 'fabric') {
                const rolls = mapRolls(l.rolls);
                if (!l.fabric_type_id) return { error: 'Each fabric line needs a fabric type.' };
                if (!rolls.length)     return { error: 'Each fabric line needs at least one roll with meters > 0.' };
                items.push({
                    item_type:       'fabric',
                    fabric_type_id:  parseInt(l.fabric_type_id),
                    fabric_color_id: l.fabric_color_id ? parseInt(l.fabric_color_id) : null,
                    qty_received:    rolls.reduce((s, r) => s + r.meter, 0),
                    rolls,
                    unit_price:      l.unit_price ? parseFloat(l.unit_price) : null,
                });
            } else if (l.type === 'trim') {
                if (!l.trim_item_variant_id) return { error: 'Each trim line needs a variant.' };
                const boxes = mapTrimBoxes(l.boxes);
                const qty = boxes.length > 0 ? sumTrimBoxes(l.boxes) : parseFloat(l.qty);
                if (!qty || qty <= 0) return { error: 'Each trim line needs a quantity > 0.' };
                const entry = {
                    item_type:            'trim',
                    trim_item_variant_id: parseInt(l.trim_item_variant_id),
                    qty_received:         qty,
                    unit_price:           l.unit_price ? parseFloat(l.unit_price) : null,
                };
                if (boxes.length > 0) entry.boxes = boxes;
                items.push(entry);
            } else if (l.type === 'spare') {
                if (!l.spare_part_id) return { error: 'Each spare line needs a spare part.' };
                const boxes = mapTrimBoxes(l.boxes);
                const qty = boxes.length > 0 ? sumTrimBoxes(l.boxes) : parseFloat(l.spare_qty);
                if (!qty || qty <= 0) return { error: 'Each spare line needs a quantity > 0.' };
                const entry = {
                    item_type:     'spare',
                    spare_part_id: parseInt(l.spare_part_id),
                    qty_received:  qty,
                    unit_price:    l.unit_price ? parseFloat(l.unit_price) : null,
                };
                if (boxes.length > 0) entry.boxes = boxes;
                items.push(entry);
            } else {
                if (!l.general_item_id) return { error: 'Each "other" line needs a general item selected.' };
                const boxes = mapTrimBoxes(l.boxes);
                const qty = boxes.length > 0 ? sumTrimBoxes(l.boxes) : parseFloat(l.other_qty);
                if (!qty || qty <= 0) return { error: 'Each "other" line needs a quantity > 0.' };
                const entry = {
                    item_type:       'other',
                    general_item_id: parseInt(l.general_item_id),
                    description:     l.description?.trim() || null,
                    qty_received:    qty,
                    uom:             l.uom || 'pcs',
                    unit_price:      l.unit_price ? parseFloat(l.unit_price) : null,
                };
                if (boxes.length > 0) entry.boxes = boxes;
                items.push(entry);
            }
        }

        const data = {
            grn_number:    null,
            received_date: receivedDate,
            condition,
            notes:         notes || null,
            supplier_id:   parseInt(supplierId),
            items,
        };

        // Human-readable snapshot of the lines — drives both the review screen
        // (before submit) and the success screen (after), including amounts.
        const summary = lines.map(l => {
            if (l.type === 'fabric') {
                const ft = fabricTypes.find(t => String(t.id) === String(l.fabric_type_id));
                const fc = fabricColors.find(c => String(c.id) === String(l.fabric_color_id));
                return { type: 'fabric', name: ft?.name || 'Fabric', detail: fc ? `${fc.name || ''}${fc.color_number ? ` (${fc.color_number})` : ''}` : '', qty: sumRolls(l.rolls), unit: 'm', unit_price: l.unit_price, boxes: null };
            }
            if (l.type === 'trim') {
                const ti = trimItems.find(t => String(t.id) === String(l.trim_item_id));
                const qty = (l.boxes?.length ? sumTrimBoxes(l.boxes) : parseFloat(l.qty) || 0);
                return { type: 'trim', name: ti?.name || 'Trim', detail: '', qty, unit: 'pcs', unit_price: l.unit_price, boxes: l.boxes?.length ? l.boxes : null };
            }
            if (l.type === 'spare') {
                const sp = spareParts.find(s => String(s.id) === String(l.spare_part_id));
                const qty = (l.boxes?.length ? sumTrimBoxes(l.boxes) : parseFloat(l.spare_qty) || 0);
                return { type: 'spare', name: sp?.name || 'Spare part', detail: sp?.part_number || '', qty, unit: 'pcs', unit_price: l.unit_price, boxes: l.boxes?.length ? l.boxes : null };
            }
            const gi = generalItems.find(g => String(g.id) === String(l.general_item_id));
            const qty = (l.boxes?.length ? sumTrimBoxes(l.boxes) : parseFloat(l.other_qty) || 0);
            return { type: 'other', name: gi?.name || 'Item', detail: l.description || '', qty, unit: l.uom || 'pcs', unit_price: l.unit_price, boxes: l.boxes?.length ? l.boxes : null };
        });

        return { data, summary, error: null };
    };

    // "Review" button — validate + snapshot, then show the review screen.
    // No API call yet.
    const handleReview = () => {
        setErr(null);
        const built = buildSubmission();
        if (built.error) { setErr(built.error); return; }
        setReviewData(built);
    };

    // "Confirm & Submit" on the review screen — the only place that actually
    // calls the API.
    const handleConfirmSubmit = async () => {
        if (!reviewData) return;
        setSaving(true); setErr(null);
        try {
            const res = isEdit
                ? await purchaseDeptApi.updateInward(inward.id, reviewData.data, scanFile || null)
                : await purchaseDeptApi.createStandaloneInward(reviewData.data, scanFile || null);
            const saved = res?.data?.data ?? res?.data ?? null;
            setCreated({
                id:            saved?.id ?? inward?.id ?? null,
                grn:           saved?.grn_number ?? inward?.grn_number ?? null,
                // Server drives the status shown — an edit to an APPROVED inward
                // may come back PENDING_UPDATE rather than a flat "updated".
                status:        saved?.approval_status ?? (isEdit ? inward?.approval_status : 'PENDING_APPROVAL'),
                received_date: receivedDate,
                condition,
                supplier_name: suppliers.find(s => String(s.id) === String(supplierId))?.name || null,
                scan_name:     scanFile?.name || null,
                lines:         reviewData.summary,
            });
            setSuccess(true);
        } catch (e) {
            const blockedBy = e?.response?.data?.blocked_by;
            const blocked = blockedBy ? describeEditBlock(blockedBy, inward?.items || []) : [];
            setErr(blocked.length > 0
                ? [e?.response?.data?.error, ...blocked].filter(Boolean).join(' ')
                : (e?.response?.data?.error || `Failed to ${isEdit ? 'update' : 'create'} inward.`));
        } finally {
            setSaving(false);
        }
    };

    // patch may be an object or an updater fn of the current line; both merge
    // shallowly, so in-flight async work never clobbers unrelated edits.
    const patchLine = (idx, patch) =>
        setLines(prev => prev.map((l, i) =>
            i === idx ? { ...l, ...(typeof patch === 'function' ? patch(l) : patch) } : l));
    const replaceLine = (idx, next) =>
        setLines(prev => prev.map((l, i) => i === idx ? next : l));
    const removeLine = (idx) =>
        setLines(prev => prev.filter((_, i) => i !== idx));
    const addLine = (type) =>
        setLines(prev => [...prev, emptyLine(type)]);

    // ── PO mode — hand off to existing modals ─────────────────────────────────

    if (poStep === 'create' && poCtx) {
        return (
            <InwardCreateModal
                poId={poCtx.po.id}
                poCode={poCtx.po.po_code}
                poItems={poCtx.items}
                supplierId={poCtx.po.supplier_id}
                supplierName={poCtx.po.supplier_name}
                allInwards={poCtx.inwards}
                initialSnapshot={poCtx.snapshot}
                onClose={onClose}
                onBack={() => setPoStep(null)}
                onReview={({ payload, snapshot }) => {
                    setPoCtx(prev => ({ ...prev, payload, snapshot }));
                    setPoStep('review');
                }}
            />
        );
    }

    if (poStep === 'review' && poCtx?.payload) {
        return (
            <InwardReviewModal
                poId={poCtx.po.id}
                poCode={poCtx.po.po_code}
                payload={poCtx.payload}
                poItems={poCtx.items}
                supplierId={poCtx.po.supplier_id}
                supplierName={poCtx.po.supplier_name}
                onClose={onClose}
                onBack={() => setPoStep('create')}
                onConfirmed={() => { onCreated?.(); onClose(); }}
            />
        );
    }

    // ── Success screen ────────────────────────────────────────────────────────

    if (success && created) {
        const totalLines = created.lines.length;
        const scfg = STATUS_CFG[created.status] || STATUS_CFG.PENDING_APPROVAL;
        // The server assigns the GRN; fall back to the inward id, and if neither
        // came back there is no number to shout about yet.
        const grnText = created.grn || (created.id ? `#${created.id}` : null);
        const invoiceTotal = created.lines.reduce((s, l) => s + (lineAmount(l) || 0), 0);
        const missingPriceCount = created.lines.filter(l => lineAmount(l) == null).length;
        return (
            <div className="fixed inset-0 z-50 bg-white flex flex-col">
                {/* Header */}
                <div className="shrink-0 px-6 py-4 border-b border-slate-100 bg-emerald-50 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center w-11 h-11 rounded-full bg-emerald-100 border border-emerald-200">
                            <CheckCircle2 size={22} className="text-emerald-600" />
                        </div>
                        <div>
                            <h2 className="font-extrabold text-slate-800 text-lg">{isEdit ? 'Inward Updated' : 'Inward Recorded'}</h2>
                            <p className="text-sm text-slate-500">{isEdit ? 'Changes saved' : 'Goods receipt saved'}</p>
                        </div>
                    </div>
                    <button onClick={() => { onCreated?.(); onClose(); }} className="p-2 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition"><X size={18} /></button>
                </div>

                {/* Body */}
                <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 max-w-3xl w-full mx-auto space-y-5">
                    {/* GRN — the one number the user needs off this screen */}
                    <div className="text-center py-2">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-2">Goods Receipt Note</p>
                        {grnText ? (
                            <p className="font-mono font-black text-emerald-700 text-4xl sm:text-6xl leading-none tracking-tight break-all">
                                {grnText}
                            </p>
                        ) : (
                            <p className="text-lg font-medium text-slate-400 italic">Auto-generating — pending</p>
                        )}
                    </div>

                    <div className={`border rounded-xl px-4 py-3 text-sm font-medium ${scfg.banner}`}>
                        {scfg.note}
                    </div>

                    {/* Meta pills */}
                    <div className="flex flex-wrap gap-2">
                        <span className={`text-xs font-bold border rounded-lg px-3 py-1.5 ${scfg.pill}`}>{scfg.label}</span>
                        {created.id != null && <span className="text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200 rounded-lg px-3 py-1.5">Inward #{created.id}</span>}
                        <span className="text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200 rounded-lg px-3 py-1.5">Received {created.received_date}</span>
                        <span className="text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200 rounded-lg px-3 py-1.5">Condition {created.condition}</span>
                        {created.supplier_name && <span className="text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200 rounded-lg px-3 py-1.5">Supplier {created.supplier_name}</span>}
                        {created.scan_name && <span className="text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200 rounded-lg px-3 py-1.5">Scan attached</span>}
                    </div>

                    {/* Submitted lines */}
                    <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">{totalLines} line{totalLines === 1 ? '' : 's'} submitted</p>
                        <div className="border border-slate-200 rounded-xl overflow-hidden">
                            <table className="w-full text-sm">
                                <thead className="bg-slate-50 text-[10px] uppercase text-slate-400 font-bold">
                                    <tr>
                                        <th className="px-4 py-2 text-left">Type</th>
                                        <th className="px-4 py-2 text-left">Item</th>
                                        <th className="px-4 py-2 text-right">Qty</th>
                                        <th className="px-4 py-2 text-right">Unit price</th>
                                        <th className="px-4 py-2 text-right">Amount</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {created.lines.map((l, i) => {
                                        const amt = lineAmount(l);
                                        return (
                                        <tr key={i}>
                                            <td className="px-4 py-2"><span className="text-[10px] uppercase tracking-wider font-bold text-slate-500 bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5">{l.type}</span></td>
                                            <td className="px-4 py-2 text-slate-700">
                                                <span className="font-semibold">{l.name}</span>{l.detail ? ` — ${l.detail}` : ''}
                                                {l.boxes && <span className="block text-[11px] text-slate-400">{l.boxes.map(b => `${b.box_count}×${b.qty_per_box}`).join(', ')} boxes</span>}
                                            </td>
                                            <td className="px-4 py-2 text-right font-mono">{Number(l.qty).toLocaleString('en-IN')} {l.unit}</td>
                                            <td className="px-4 py-2 text-right font-mono text-slate-500">{l.unit_price ? `₹${formatPricePrecise(parseFloat(l.unit_price))}` : '—'}</td>
                                            <td className="px-4 py-2 text-right font-mono font-bold text-slate-800">{amt != null ? `₹${formatMoney(amt)}` : <span className="font-normal text-slate-300">—</span>}</td>
                                        </tr>
                                        );
                                    })}
                                </tbody>
                                <tfoot>
                                    <tr className="bg-slate-800 text-white">
                                        <td colSpan={4} className="px-4 py-2.5 text-right text-xs font-bold uppercase tracking-wider">Total Invoice Value</td>
                                        <td className="px-4 py-2.5 text-right font-mono font-black text-base">₹{formatMoney(invoiceTotal)}</td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                        {missingPriceCount > 0 && (
                            <p className="text-[11px] text-amber-600 mt-1.5">{missingPriceCount} line{missingPriceCount === 1 ? '' : 's'} had no unit price — total above is incomplete.</p>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="shrink-0 px-6 py-4 border-t border-slate-100 flex justify-end">
                    <button onClick={() => { onCreated?.(); onClose(); }} className="text-sm font-bold text-white bg-orange-500 hover:bg-orange-600 px-6 py-2.5 rounded-xl transition">Done</button>
                </div>
            </div>
        );
    }

    // ── Review screen (standalone flow) — confirm before the API call ─────────

    if (reviewData) {
        const invoiceTotal = reviewData.summary.reduce((s, l) => s + (lineAmount(l) || 0), 0);
        const missingPriceCount = reviewData.summary.filter(l => lineAmount(l) == null).length;
        const supplierName = suppliers.find(s => String(s.id) === String(supplierId))?.name;
        return (
            <div className="fixed inset-0 z-50 bg-white flex flex-col">
                <div className="shrink-0 px-5 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        {!saving && (
                            <button onClick={() => setReviewData(null)} className="p-1.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition">
                                <ArrowLeft size={18} />
                            </button>
                        )}
                        <div>
                            <h3 className="font-black text-slate-800 text-base">Review before saving</h3>
                            <p className="text-xs text-slate-500 mt-0.5">
                                {reviewData.summary.length} line{reviewData.summary.length !== 1 ? 's' : ''} will be {isEdit ? 'updated' : 'recorded'} — nothing is saved yet.
                                {isEdit && inward.approval_status === 'APPROVED' && ' This inward is already approved — saving will submit the change for re-approval.'}
                            </p>
                        </div>
                    </div>
                    {!saving && (
                        <button onClick={onClose} className="p-1.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition">
                            <X size={18} />
                        </button>
                    )}
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 max-w-3xl w-full mx-auto space-y-5">
                    {err && (
                        <div className="flex items-center gap-2 bg-red-50 border border-red-100 rounded-xl px-3 py-2 text-sm text-red-600">
                            <AlertTriangle size={13} /> {err}
                        </div>
                    )}

                    <div className="flex flex-wrap gap-2">
                        <span className="text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200 rounded-lg px-3 py-1.5">Received {receivedDate}</span>
                        <span className="text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200 rounded-lg px-3 py-1.5">Condition {condition}</span>
                        {supplierName && <span className="text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200 rounded-lg px-3 py-1.5">Supplier {supplierName}</span>}
                        {scanFile && <span className="text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200 rounded-lg px-3 py-1.5">Scan attached</span>}
                    </div>

                    <div>
                        <div className="border border-slate-200 rounded-xl overflow-hidden">
                            <table className="w-full text-sm">
                                <thead className="bg-slate-50 text-[10px] uppercase text-slate-400 font-bold">
                                    <tr>
                                        <th className="px-4 py-2 text-left">Type</th>
                                        <th className="px-4 py-2 text-left">Item</th>
                                        <th className="px-4 py-2 text-right">Qty</th>
                                        <th className="px-4 py-2 text-right">Unit price</th>
                                        <th className="px-4 py-2 text-right">Amount</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {reviewData.summary.map((l, i) => {
                                        const amt = lineAmount(l);
                                        return (
                                        <tr key={i}>
                                            <td className="px-4 py-2"><span className="text-[10px] uppercase tracking-wider font-bold text-slate-500 bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5">{l.type}</span></td>
                                            <td className="px-4 py-2 text-slate-700">
                                                <span className="font-semibold">{l.name}</span>{l.detail ? ` — ${l.detail}` : ''}
                                                {l.boxes && <span className="block text-[11px] text-slate-400">{l.boxes.map(b => `${b.box_count}×${b.qty_per_box}`).join(', ')} boxes</span>}
                                            </td>
                                            <td className="px-4 py-2 text-right font-mono">{Number(l.qty).toLocaleString('en-IN')} {l.unit}</td>
                                            <td className="px-4 py-2 text-right font-mono text-slate-500">{l.unit_price ? `₹${formatPricePrecise(parseFloat(l.unit_price))}` : '—'}</td>
                                            <td className="px-4 py-2 text-right font-mono font-bold text-slate-800">{amt != null ? `₹${formatMoney(amt)}` : <span className="font-normal text-slate-300">—</span>}</td>
                                        </tr>
                                        );
                                    })}
                                </tbody>
                                <tfoot>
                                    <tr className="bg-slate-800 text-white">
                                        <td colSpan={4} className="px-4 py-2.5 text-right text-xs font-bold uppercase tracking-wider">Total Invoice Value</td>
                                        <td className="px-4 py-2.5 text-right font-mono font-black text-base">₹{formatMoney(invoiceTotal)}</td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                        {missingPriceCount > 0 && (
                            <p className="text-[11px] text-amber-600 mt-1.5">{missingPriceCount} line{missingPriceCount === 1 ? '' : 's'} have no unit price — total above is incomplete. Go back to add one, or continue if that's expected.</p>
                        )}
                    </div>

                    {notes && (
                        <div className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Notes</p>
                            <p className="text-xs text-slate-700 mt-0.5 whitespace-pre-wrap">{notes}</p>
                        </div>
                    )}
                </div>

                <div className="shrink-0 flex items-center justify-between px-5 py-4 border-t border-slate-100 bg-slate-50">
                    <button onClick={() => setReviewData(null)} disabled={saving}
                        className="flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-700 px-3 py-2 rounded-lg hover:bg-slate-200 transition disabled:opacity-50">
                        <ArrowLeft size={14} /> Back to edit
                    </button>
                    <button onClick={handleConfirmSubmit} disabled={saving}
                        className="flex items-center gap-2 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 px-5 py-2 rounded-xl transition">
                        {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                        {saving ? 'Submitting…' : 'Confirm & Submit'}
                    </button>
                </div>
            </div>
        );
    }

    // ── Entry chooser — first thing the user sees ─────────────────────────────

    if (entryMode === null) {
        return (
            <div className="fixed inset-0 z-50 bg-white flex flex-col">
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50 shrink-0">
                    <div>
                        <h3 className="font-black text-slate-800 text-base">Record Inward</h3>
                        <p className="text-xs text-slate-500 mt-0.5">How was this stock received?</p>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition">
                        <X size={18} />
                    </button>
                </div>

                <div className="flex-1 flex items-center justify-center p-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 w-full max-w-2xl">
                        <button
                            type="button"
                            onClick={() => setEntryMode('po')}
                            className="group flex flex-col items-center text-center gap-4 border-2 border-slate-200 hover:border-orange-400 hover:bg-orange-50/50 rounded-2xl px-8 py-10 transition"
                        >
                            <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-orange-100 text-orange-600 group-hover:bg-orange-500 group-hover:text-white transition">
                                <ClipboardList size={28} />
                            </div>
                            <div>
                                <p className="font-extrabold text-slate-800 text-base">Against a PO</p>
                                <p className="text-xs text-slate-500 mt-1">Receiving goods against an existing Purchase Order</p>
                            </div>
                            <span className="flex items-center gap-1 text-xs font-bold text-orange-600 opacity-0 group-hover:opacity-100 transition">
                                Continue <ArrowRight size={12} />
                            </span>
                        </button>

                        <button
                            type="button"
                            onClick={() => setEntryMode('standalone')}
                            className="group flex flex-col items-center text-center gap-4 border-2 border-slate-200 hover:border-orange-400 hover:bg-orange-50/50 rounded-2xl px-8 py-10 transition"
                        >
                            <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-orange-100 text-orange-600 group-hover:bg-orange-500 group-hover:text-white transition">
                                <PackagePlus size={28} />
                            </div>
                            <div>
                                <p className="font-extrabold text-slate-800 text-base">Without a PO</p>
                                <p className="text-xs text-slate-500 mt-1">Standalone receipt — walk-in stock, samples, etc.</p>
                            </div>
                            <span className="flex items-center gap-1 text-xs font-bold text-orange-600 opacity-0 group-hover:opacity-100 transition">
                                Continue <ArrowRight size={12} />
                            </span>
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // ── PO search screen ───────────────────────────────────────────────────────

    if (entryMode === 'po') {
        return (
            <div className="fixed inset-0 z-50 bg-white flex flex-col">
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50 shrink-0">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => { setEntryMode(null); setSelectedPo(null); setPoSearch(''); setErr(null); }}
                            className="p-1.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition"
                        >
                            <ArrowLeft size={18} />
                        </button>
                        <div>
                            <h3 className="font-black text-slate-800 text-base">Select Purchase Order</h3>
                            <p className="text-xs text-slate-500 mt-0.5">Pick the PO you're receiving goods against</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition">
                        <X size={18} />
                    </button>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto px-5 py-5 w-full max-w-xl mx-auto space-y-3">
                    {err && (
                        <div className="flex items-center gap-2 bg-red-50 border border-red-100 rounded-xl px-3 py-2 text-sm text-red-600">
                            <AlertTriangle size={13} /> {err}
                        </div>
                    )}
                    <input
                        type="text"
                        autoFocus
                        placeholder="Search PO code or supplier…"
                        value={poSearch}
                        onChange={e => setPoSearch(e.target.value)}
                        className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-orange-400"
                    />
                    {poListLoading ? (
                        <div className="flex justify-center py-8"><Loader2 size={20} className="animate-spin text-slate-400" /></div>
                    ) : (
                        <div className="space-y-1.5">
                            {filteredPos.map(po => (
                                <button
                                    key={po.id}
                                    type="button"
                                    onClick={() => setSelectedPo(po)}
                                    className={`w-full flex items-center justify-between text-left px-4 py-3 rounded-xl border transition text-sm ${
                                        selectedPo?.id === po.id
                                            ? 'bg-orange-50 border-orange-300 text-orange-700'
                                            : 'bg-white border-slate-200 hover:border-orange-200'
                                    }`}
                                >
                                    <span className="font-bold">{po.po_code || `PO #${po.id}`}</span>
                                    <span className="text-slate-400 text-xs">{po.supplier_name}</span>
                                </button>
                            ))}
                            {filteredPos.length === 0 && !poListLoading && (
                                <p className="text-sm text-slate-400 text-center py-8">No open POs found</p>
                            )}
                        </div>
                    )}
                </div>

                <div className="shrink-0 px-5 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
                    <span className="text-xs text-slate-500">
                        {selectedPo
                            ? <>Selected: <span className="font-bold text-slate-700">{selectedPo.po_code || `PO #${selectedPo.id}`}</span></>
                            : 'No PO selected'}
                    </span>
                    <button
                        type="button"
                        onClick={handleLoadPo}
                        disabled={!selectedPo || poLoading}
                        className="flex items-center gap-1.5 text-sm font-bold text-white bg-orange-500 hover:bg-orange-600 disabled:opacity-50 px-5 py-2.5 rounded-xl transition"
                    >
                        {poLoading ? <Loader2 size={14} className="animate-spin" /> : null}
                        Continue <ArrowRight size={14} />
                    </button>
                </div>
            </div>
        );
    }

    // ── Free-form modal (entryMode === 'standalone') ───────────────────────────

    return (
        <>
        <div className="fixed inset-0 z-50 bg-white flex flex-col">
            <div className="bg-white w-full h-full flex flex-col" onClick={e => e.stopPropagation()}>

                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50 rounded-t-2xl shrink-0">
                    <div className="flex items-center gap-3">
                        {!saving && !isEdit && (
                            <button onClick={() => setEntryMode(null)} className="p-1.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition">
                                <ArrowLeft size={18} />
                            </button>
                        )}
                        <div>
                            <h3 className="font-black text-slate-800 text-base">{isEdit ? 'Edit Inward' : 'Record Inward'}</h3>
                            <p className="text-xs text-slate-500 mt-0.5">
                                {isEdit
                                    ? (inward.grn_number || `GRN #${inward.id}`)
                                    : 'Standalone goods receipt — no PO required'}
                            </p>
                        </div>
                    </div>
                    {!saving && (
                        <button onClick={onClose} className="p-1.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition">
                            <X size={18} />
                        </button>
                    )}
                </div>

                {/* Body */}
                <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-5 w-full max-w-4xl mx-auto">
                    {err && (
                        <div className="flex items-center gap-2 bg-red-50 border border-red-100 rounded-xl px-3 py-2 text-sm text-red-600">
                            <AlertTriangle size={13} /> {err}
                        </div>
                    )}

                    {/* Header fields */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">GRN Number</label>
                            <input type="text" value="" disabled placeholder="Auto-generated on submit"
                                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-slate-50 text-slate-400 cursor-not-allowed" />
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Received Date *</label>
                            <input type="date" value={receivedDate} onChange={e => setReceivedDate(e.target.value)}
                                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-orange-400" />
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                                Supplier <span className="text-red-500">*</span>
                            </label>
                            <select value={supplierId} onChange={e => setSupplierId(e.target.value)}
                                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-orange-400">
                                <option value="">Select supplier…</option>
                                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Condition</label>
                            <select value={condition} onChange={e => setCondition(e.target.value)}
                                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-orange-400">
                                {CONDITIONS.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>
                        <div className="col-span-2">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Notes (optional)</label>
                            <textarea rows={2} placeholder="Any notes for the purchase manager…" value={notes} onChange={e => setNotes(e.target.value)}
                                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-orange-400 resize-none" />
                        </div>
                        <div className="col-span-2">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Scan / Challan (optional)</label>
                            <label className="flex items-center gap-2 cursor-pointer text-sm border border-dashed border-slate-300 hover:border-orange-400 rounded-xl px-3 py-2 transition">
                                <Upload size={14} className="text-slate-400" />
                                {scanFile ? (
                                    <span className="text-slate-700 font-medium truncate max-w-xs">{scanFile.name}</span>
                                ) : (
                                    <span className="text-slate-400">Click to upload JPG / PNG / PDF</span>
                                )}
                                <input type="file" accept="image/*,.pdf" className="hidden" onChange={e => setScanFile(e.target.files[0] || null)} />
                                {scanFile && (
                                    <button type="button" onClick={e => { e.preventDefault(); setScanFile(null); }}
                                        className="ml-auto text-slate-400 hover:text-red-500">
                                        <X size={13} />
                                    </button>
                                )}
                            </label>
                        </div>
                    </div>

                    {/* Line items */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <p className="text-xs font-bold text-slate-600">Line Items <span className="text-red-500">*</span></p>
                            <p className="text-[10px] text-slate-400">{lines.length} line{lines.length !== 1 ? 's' : ''}</p>
                        </div>

                        {lines.map((line, idx) => (
                            <LineCard
                                key={line._k}
                                line={line}
                                fabricTypes={fabricTypes}
                                fabricColors={fabricColors}
                                trimItems={trimItems}
                                spareParts={spareParts}
                                generalItems={generalItems}
                                onAddGeneralItem={(cb) => { setQuickCreateName(''); setQuickCreateCode(''); setQuickCreateErr(null); setQuickCreate(() => cb); }}
                                onOpenBoxes={(ln) => setBoxModal({ idx, uom: ln.uom || 'pcs', initialBoxes: ln.boxes || [] })}
                                onPatch={patch => patchLine(idx, patch)}
                                onReplace={next => replaceLine(idx, next)}
                                onRemove={() => removeLine(idx)}
                            />
                        ))}

                        {/* Add line buttons */}
                        <div className="flex flex-wrap gap-1.5 pt-1">
                            {TYPES.map(({ key, label, icon: Icon }) => (
                                <button key={key} type="button" onClick={() => addLine(key)}
                                    className="flex items-center gap-1 text-[10px] font-bold text-slate-600 hover:text-orange-600 border border-slate-200 hover:border-orange-300 px-2.5 py-1.5 rounded-lg transition">
                                    <Plus size={10} /><Icon size={10} /> {label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between px-5 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl shrink-0">
                    <button onClick={onClose} disabled={saving}
                        className="text-sm font-medium text-slate-500 hover:text-slate-700 px-3 py-2 rounded-lg hover:bg-slate-200 transition disabled:opacity-50">
                        Cancel
                    </button>
                    <button onClick={handleReview} disabled={lines.length === 0 || !supplierId}
                        className="flex items-center gap-2 text-sm font-bold text-white bg-orange-500 hover:bg-orange-600 disabled:opacity-50 px-5 py-2 rounded-xl transition">
                        <FileText size={14} />
                        {`Review ${isEdit ? 'Changes' : 'Inward'} (${lines.length} line${lines.length !== 1 ? 's' : ''})`}
                    </button>
                </div>
            </div>
        </div>

        {/* Quick-create general item modal */}
        {quickCreate && (
            <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
                    <div className="flex items-center justify-between">
                        <h3 className="text-sm font-bold text-slate-800">New General Item</h3>
                        <button onClick={() => setQuickCreate(null)} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400"><X size={16} /></button>
                    </div>
                    <div className="space-y-3">
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Name *</label>
                            <input
                                autoFocus
                                type="text" value={quickCreateName}
                                onChange={e => setQuickCreateName(e.target.value)}
                                placeholder="e.g. Sewing Needle #14"
                                className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:border-orange-400"
                            />
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Item Code <span className="text-slate-300 font-normal">(optional)</span></label>
                            <input
                                type="text" value={quickCreateCode}
                                onChange={e => setQuickCreateCode(e.target.value)}
                                placeholder="e.g. GI-001"
                                className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:border-orange-400"
                            />
                        </div>
                    </div>
                    {quickCreateErr && (
                        <div className="flex items-center gap-2 bg-red-50 border border-red-100 rounded-xl px-3 py-2 text-xs text-red-600">
                            <AlertTriangle size={13} /> {quickCreateErr}
                        </div>
                    )}
                    <div className="flex justify-end gap-2 pt-1">
                        <button onClick={() => setQuickCreate(null)} className="text-sm text-slate-500 hover:text-slate-700 px-3 py-2 rounded-xl hover:bg-slate-100 transition">Cancel</button>
                        <button
                            onClick={handleQuickCreate}
                            disabled={quickCreateBusy}
                            className="flex items-center gap-1.5 text-sm font-bold text-white bg-orange-500 hover:bg-orange-600 disabled:opacity-40 px-4 py-2 rounded-xl transition"
                        >
                            {quickCreateBusy ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
                            Create & Select
                        </button>
                    </div>
                </div>
            </div>
        )}

        <BoxBreakdownModal
            open={!!boxModal}
            title="Box breakdown"
            uom={boxModal?.uom || 'pcs'}
            initialBoxes={boxModal?.initialBoxes || []}
            onSave={(saved) => { if (boxModal) patchLine(boxModal.idx, { boxes: saved }); setBoxModal(null); }}
            onClose={() => setBoxModal(null)}
        />
        </>
    );
}

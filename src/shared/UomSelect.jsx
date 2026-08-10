// Shared unit-of-measure picker. A plain <select> (not SearchableSelect) because
// the list is short and fixed — but still lets a previously stored free-text
// value (from before this dropdown existed, or a one-off unit) round-trip.
// Values match the convention already used across purchase_department/production
// (InwardModal, PoDetailModal, FabricIntakeForm): full words, not abbreviations —
// so a fabric card's default 'meter' and a PO item's uom stay the same string
// end to end instead of splitting into 'meter' vs 'm' across the PO lifecycle.
export const COMMON_UOMS = ['pcs', 'meter', 'yard', 'kg', 'g', 'dozen', 'gross', 'roll', 'cone', 'box', 'pkt', 'pair', 'set', 'liter'];

export default function UomSelect({ value, onChange, className, placeholder = '— Unit —' }) {
    return (
        <select
            value={value}
            onChange={e => onChange(e.target.value)}
            className={className || 'w-full text-sm border border-slate-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:border-orange-400'}
        >
            <option value="">{placeholder}</option>
            {/* keep a previously entered free-text value selectable */}
            {value && !COMMON_UOMS.includes(value) && <option value={value}>{value}</option>}
            {COMMON_UOMS.map(u => <option key={u} value={u}>{u}</option>)}
        </select>
    );
}

// ─── PRIORITY CHIP ───────────────────────────────────────────────────────────
// Color-coded batch priority (LOW/MEDIUM/HIGH) — read-only pill by default;
// pass `onChange` to render it as an inline editable control instead (used
// by production managers on the Production Workflow page). One shared
// component so every card/list/modal that shows a batch's priority looks
// and behaves identically.
const PRIORITY_STYLES = {
    LOW:    { label: 'Low',    cls: 'bg-slate-100 text-slate-500 border-slate-200' },
    MEDIUM: { label: 'Medium', cls: 'bg-amber-100 text-amber-700 border-amber-200' },
    HIGH:   { label: 'High',   cls: 'bg-red-100 text-red-700 border-red-200' },
};
export const PRIORITY_LEVELS = ['LOW', 'MEDIUM', 'HIGH'];

const SIZE_CLASSES = {
    xs: 'text-[8px] px-1.5 py-0.5',
    sm: 'text-[9px] px-2 py-0.5',
    md: 'text-[10px] px-2.5 py-1',
};

export default function PriorityChip({ priority, onChange, size = 'sm', className = '', disabled = false }) {
    const style = PRIORITY_STYLES[priority] || PRIORITY_STYLES.MEDIUM;
    const sizeCls = SIZE_CLASSES[size] || SIZE_CLASSES.sm;

    if (!onChange) {
        return (
            <span
                className={`inline-flex items-center rounded-full font-bold uppercase tracking-wider border whitespace-nowrap ${sizeCls} ${style.cls} ${className}`}
                title={`Priority: ${style.label}`}
            >
                {style.label}
            </span>
        );
    }

    // Editable — a native <select> styled to look like the chip. Simplest,
    // most robust option for a small control embedded in dozens of
    // differently-laid-out cards; no popover-positioning needed.
    return (
        <select
            value={priority || 'MEDIUM'}
            disabled={disabled}
            onChange={e => onChange(e.target.value)}
            onClick={e => e.stopPropagation()}
            title="Set batch priority"
            className={`rounded-full font-bold uppercase tracking-wider border cursor-pointer focus:outline-none focus:ring-1 focus:ring-violet-400 disabled:opacity-50 disabled:cursor-not-allowed ${sizeCls} ${style.cls} ${className}`}
        >
            {PRIORITY_LEVELS.map(val => (
                <option key={val} value={val}>{PRIORITY_STYLES[val].label}</option>
            ))}
        </select>
    );
}

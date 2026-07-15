// Shared formatting helpers for the trim-loss module (kept in one place to avoid import cycles).
export const fmtDateTime = (d) => d ? new Date(d).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
export const fmtMoney = (v) => `₹${parseFloat(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const variantText = (l) =>
    [`${l?.color_number ? `${l.color_number} - ` : ''}${l?.color_name || ''}`.trim(), l?.variant_size].filter(Boolean).join(' / ');

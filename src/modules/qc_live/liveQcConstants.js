// Shared between LiveQcTrackingPage.jsx (line cards) and LiveLineStatsModal.jsx
// (workstation cards) — kept in its own dependency-free file rather than
// exported from one of those components, since both already import from each
// other (the page opens the modal; the modal's "View Full Log" flow is driven
// by the page) and a third mutual import would create a circular dependency.

export const FRESH_MS = 30_000; // "active now" pulse window

export const dhuLevel = (dhu) => {
    if (dhu == null) return 'neutral';
    if (dhu < 5)   return 'good';
    if (dhu < 20)  return 'warn';
    if (dhu < 50)  return 'bad';
    return 'critical';
};

export const DHU_STYLES = {
    good:     { text: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-200' },
    warn:     { text: 'text-amber-600',   bg: 'bg-amber-50 border-amber-200' },
    bad:      { text: 'text-orange-600',  bg: 'bg-orange-50 border-orange-200' },
    critical: { text: 'text-red-600',     bg: 'bg-red-50 border-red-200' },
    neutral:  { text: 'text-slate-400',   bg: 'bg-slate-50 border-slate-200' },
};

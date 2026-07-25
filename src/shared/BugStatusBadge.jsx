import React from 'react';

const STATUS_STYLES = {
    open: 'bg-gray-100 text-gray-700 border-gray-200',
    in_progress: 'bg-blue-100 text-blue-800 border-blue-200',
    resolved: 'bg-green-100 text-green-800 border-green-200',
    closed: 'bg-slate-100 text-slate-600 border-slate-200',
    wont_fix: 'bg-amber-100 text-amber-800 border-amber-200',
};

const STATUS_LABELS = {
    wont_fix: "WON'T FIX",
};

export const BugStatusBadge = ({ status }) => (
    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border uppercase tracking-wide whitespace-nowrap ${STATUS_STYLES[status] ?? 'bg-gray-100 text-gray-600 border-gray-200'}`}>
        {STATUS_LABELS[status] ?? status?.replace(/_/g, ' ') ?? '—'}
    </span>
);

const LEVEL_STYLES = {
    low: 'bg-green-50 text-green-700 border-green-100',
    medium: 'bg-yellow-50 text-yellow-700 border-yellow-100',
    high: 'bg-orange-50 text-orange-700 border-orange-100',
    critical: 'bg-red-50 text-red-700 border-red-100 animate-pulse',
};

// Shared by both `severity` (reporter-set) and `priority` (admin-set) — same enum values.
export const BugLevelBadge = ({ level }) => (
    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border uppercase tracking-wide whitespace-nowrap ${LEVEL_STYLES[level] ?? 'bg-gray-50 text-gray-500 border-gray-100'}`}>
        {level ?? '—'}
    </span>
);

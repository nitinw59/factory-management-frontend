// Single source of truth for trim-loss case + debit-note badges and the case-detail stepper.
// Case lifecycle (FE brief Part 2, line 121):
//   REPORTED ──found in full──▶ FOUND (terminal near-miss)
//       └─not found / partial─▶ ESCALATED ─▶ UNDER_INVESTIGATION ─▶ RESPONSIBILITY_FIXED ─▶ DEBIT_APPROVED ─▶ CLOSED
//                                    └────────── CANCELLED (false alarm, pre-responsibility) ──────────
export const CASE_STATUS_CONFIG = {
    REPORTED: { label: 'Reported', badge: 'bg-amber-100 text-amber-800 border-amber-200', dot: 'bg-amber-500' },
    FOUND: { label: 'Found (near-miss)', badge: 'bg-green-100 text-green-800 border-green-200', dot: 'bg-green-500' },
    ESCALATED: { label: 'Escalated', badge: 'bg-red-100 text-red-800 border-red-200', dot: 'bg-red-500' },
    UNDER_INVESTIGATION: { label: 'Under Investigation', badge: 'bg-orange-100 text-orange-800 border-orange-200', dot: 'bg-orange-500' },
    RESPONSIBILITY_FIXED: { label: 'Responsibility Fixed', badge: 'bg-indigo-100 text-indigo-800 border-indigo-200', dot: 'bg-indigo-500' },
    DEBIT_APPROVED: { label: 'Debits Approved', badge: 'bg-purple-100 text-purple-800 border-purple-200', dot: 'bg-purple-500' },
    CLOSED: { label: 'Closed', badge: 'bg-gray-100 text-gray-700 border-gray-200', dot: 'bg-gray-500' },
    CANCELLED: { label: 'Cancelled', badge: 'bg-gray-100 text-gray-500 border-gray-200', dot: 'bg-gray-400' },
};

export const caseStatusOf = (status) =>
    CASE_STATUS_CONFIG[status] || { label: status || 'Unknown', badge: 'bg-gray-100 text-gray-700 border-gray-200', dot: 'bg-gray-400' };

// Debit-note lifecycle (PM approval → HR recovery).
export const DEBIT_STATUS_CONFIG = {
    PENDING: { label: 'Pending approval', badge: 'bg-amber-100 text-amber-800 border-amber-200' },
    APPROVED: { label: 'Approved — awaiting recovery', badge: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
    RECOVERED: { label: 'Recovered', badge: 'bg-green-100 text-green-800 border-green-200' },
    WRITTEN_OFF: { label: 'Written off', badge: 'bg-gray-100 text-gray-600 border-gray-200' },
    CANCELLED: { label: 'Cancelled', badge: 'bg-gray-100 text-gray-500 border-gray-200' },
};

export const debitStatusOf = (status) =>
    DEBIT_STATUS_CONFIG[status] || { label: status || 'Unknown', badge: 'bg-gray-100 text-gray-700 border-gray-200' };

// Ordered stages for the case-detail timeline/stepper — the linear escalation path.
// FOUND and CANCELLED are terminal off-path outcomes, handled specially by the timeline.
export const CASE_STAGES = [
    'REPORTED',
    'ESCALATED',
    'UNDER_INVESTIGATION',
    'RESPONSIBILITY_FIXED',
    'DEBIT_APPROVED',
    'CLOSED',
];

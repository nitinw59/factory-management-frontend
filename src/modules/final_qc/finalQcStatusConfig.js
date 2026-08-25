// Single source of truth for Final QC inspection status badges + timeline.
// Lifecycle: OPEN (transient, never actually returned to the FE — create()
// computes the next status synchronously) → PASSED | FAILED →
// FAILED → WAIVED → PASSED | WAIVED → CLOSED (terminal).
export const INSPECTION_STATUS_CONFIG = {
    OPEN:   { label: 'Open',   badge: 'bg-slate-100 text-slate-600 border-slate-200',   dot: 'bg-slate-400' },
    PASSED: { label: 'Passed', badge: 'bg-emerald-100 text-emerald-800 border-emerald-200', dot: 'bg-emerald-500' },
    FAILED: { label: 'Failed', badge: 'bg-red-100 text-red-800 border-red-200',         dot: 'bg-red-500' },
    WAIVED: { label: 'Waived', badge: 'bg-amber-100 text-amber-800 border-amber-200',   dot: 'bg-amber-500' },
    CLOSED: { label: 'Closed', badge: 'bg-gray-100 text-gray-700 border-gray-200',      dot: 'bg-gray-500' },
};

export const inspectionStatusOf = (status) =>
    INSPECTION_STATUS_CONFIG[status] || { label: status || 'Unknown', badge: 'bg-gray-100 text-gray-700 border-gray-200', dot: 'bg-gray-400' };

// result is a separate axis from status (PASS/FAIL as tallied — status also
// reflects WAIVED/CLOSED overrides on top of that raw result).
export const RESULT_CONFIG = {
    PASS: { label: 'Pass', badge: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
    FAIL: { label: 'Fail', badge: 'bg-red-100 text-red-800 border-red-200' },
};
export const resultOf = (result) =>
    RESULT_CONFIG[result] || { label: result || '—', badge: 'bg-gray-100 text-gray-600 border-gray-200' };

export const SEVERITY_OPTIONS = ['CRITICAL', 'MAJOR', 'MINOR'];
export const SEVERITY_CONFIG = {
    CRITICAL: { label: 'Critical', badge: 'bg-red-100 text-red-800 border-red-200' },
    MAJOR:    { label: 'Major',    badge: 'bg-orange-100 text-orange-800 border-orange-200' },
    MINOR:    { label: 'Minor',    badge: 'bg-amber-100 text-amber-800 border-amber-200' },
};
export const severityOf = (s) =>
    SEVERITY_CONFIG[s] || { label: s || '—', badge: 'bg-gray-100 text-gray-600 border-gray-200' };

// Mirrors the backend's result rule so the create form can show a live PASS/FAIL
// preview before submit — purely advisory, the server is authoritative.
export const previewResult = (defects, majorLimit, minorLimit) => {
    const list = defects || [];
    // *_defect_count on the server is a tally of quantity, not a count of
    // defect lines — a single MINOR line with quantity 5 counts as 5.
    const sumBy = (severity) => list
        .filter(d => d.severity === severity)
        .reduce((s, d) => s + (parseInt(d.quantity, 10) || 0), 0);
    const criticalCount = sumBy('CRITICAL');
    const majorCount    = sumBy('MAJOR');
    const minorCount    = sumBy('MINOR');
    const fail = criticalCount > 0 || majorCount > (Number(majorLimit) || 0) || minorCount > (Number(minorLimit) || 0);
    return { criticalCount, majorCount, minorCount, result: fail ? 'FAIL' : 'PASS' };
};

// "QC cleared" / "no QC inspection" / "QC failed" gate badge — see GET /final-qc/gate/:batchId.
export const gateStyleOf = (cleared, latest) => {
    if (!latest) return { label: 'No QC inspection', cls: 'bg-amber-100 text-amber-800 border-amber-200' };
    if (cleared) return { label: 'QC cleared', cls: 'bg-emerald-100 text-emerald-800 border-emerald-200' };
    return { label: 'QC failed', cls: 'bg-red-100 text-red-800 border-red-200' };
};

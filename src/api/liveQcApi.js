import api from '../utils/api';

export const liveQcApi = {
    // [{ line_id, checked_count, defect_count, updated_at }] for today only —
    // initial baseline for the Live QC Tracking page; live updates arrive
    // over the /ws socket as QC_LIVE_EVENT messages (see useLiveQcSocket).
    getTodaySummary: () => api.get('/qc/live/today-summary'),

    // Line-card drilldown — every unit (piece/garment) checked on one line,
    // defaulting to today. params: { line_id, date?, page?, page_size?, defects_only?, checked_by_user_id?, search? }
    getLineUnits: (params) => api.get('/qc/live/line-units', { params }),

    // Line-card stats summary — top 3 defects in the last hour, top 3 today,
    // plus checked/defect totals for both windows. params: { line_id }
    getLineDefectSummary: (params) => api.get('/qc/live/line-defect-summary', { params }),

    // The workstations feeding one line, in sequence order, each with its own
    // full checked/defect stats for the last hour and today. params: { line_id }
    getLineWorkstations: (params) => api.get('/qc/live/line-workstations', { params }),

    // Same shape as getLineWorkstations but for every active line at once
    // (tagged with line_id/line_name) — backs the auto-rotating workstation
    // board on the Live QC Tracking page.
    getAllWorkstations: () => api.get('/qc/live/workstations'),

    // Live-feed record drilldown — the exact rows one broadcast event wrote,
    // by the check_log_ids carried on the event itself.
    getUnitsByIds: (ids) => api.get('/qc/live/units', { params: { ids: ids.join(',') } }),
};

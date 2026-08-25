import api from '../utils/api';

export const liveQcApi = {
    // [{ line_id, checked_count, defect_count, updated_at }] for today only —
    // initial baseline for the Live QC Tracking page; live updates arrive
    // over the /ws socket as QC_LIVE_EVENT messages (see useLiveQcSocket).
    getTodaySummary: () => api.get('/qc/live/today-summary'),

    // Line-card drilldown — every unit (piece/garment) checked on one line,
    // defaulting to today. params: { line_id, date?, page?, page_size?, defects_only? }
    getLineUnits: (params) => api.get('/qc/live/line-units', { params }),

    // Line-card stats summary — top 3 defects in the last hour, top 3 today,
    // plus checked/defect totals for both windows. params: { line_id }
    getLineDefectSummary: (params) => api.get('/qc/live/line-defect-summary', { params }),

    // Live-feed record drilldown — the exact rows one broadcast event wrote,
    // by the check_log_ids carried on the event itself.
    getUnitsByIds: (ids) => api.get('/qc/live/units', { params: { ids: ids.join(',') } }),
};

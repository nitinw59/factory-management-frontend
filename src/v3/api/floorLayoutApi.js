import api from '../../utils/api';

// Version 3.0 floor layout board (20 Oct 2026) — backend routes/v3/floorLayoutRoutes.js (/api/v3/floor-layout).
export const floorLayoutApi = {
    permissions: () => api.get('/v3/floor-layout/permissions'),
    board: () => api.get('/v3/floor-layout'),
    log: () => api.get('/v3/floor-layout/log'),
    setResponsible: (lineId, kind, userId, confirm) => api.put(`/v3/floor-layout/lines/${lineId}/responsible`, { kind, user_id: userId, confirm }),
    order: (lineId, workstationIds) => api.put(`/v3/floor-layout/lines/${lineId}/order`, { workstation_ids: workstationIds }),
    place: (workstationId, lineId, position, confirm) => api.post(`/v3/floor-layout/workstations/${workstationId}/place`, { line_id: lineId, position, confirm }),
};

import api from '../utils/api';


export const costingApi = {
    getCostingReportRange: (config) => api.get('/costing/daily', config),
    getCostingDrilldown: (config) => api.get('/costing/drilldown', config),
    
    // NEW: Drilldown for Production metrics
    getProductionDrilldown: (config) => api.get('/costing/production-drilldown', config)
};
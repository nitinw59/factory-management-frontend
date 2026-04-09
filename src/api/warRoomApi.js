import api from '../utils/api';

export const warRoomApi = {
    // getWarRoomData: () => api.get('/war-room/data'),
    // getMachineStatus: () => api.get('/war-room/machine-status'),
    // getProductionMetrics: () => api.get('/war-room/production-metrics'),
    // getMaintenanceAlerts: () => api.get('/war-room/maintenance-alerts'),
    // getInventoryLevels: () => api.get('/war-room/inventory-levels'),
    // getOperatorPerformance: () => api.get('/war-room/operator-performance'),
    // getEnergyConsumption: () => api.get('/war-room/energy-consumption'),
    // getQualityControlData: () => api.get('/war-room/quality-control-data'),
    // getDowntimeAnalysis: () => api.get('/war-room/downtime-analysis'),
    // getRealTimeAlerts: () => api.get('/war-room/real-time-alerts'),

    getFloorStatus: () => api.get('/war-room/floor-status'),
    getOperatorAnalytics: (empId) => api.get(`/war-room/operator-analytics/${empId}`),
    getBatchWipReconciliation: () => api.get('/war-room/batch-wip-reconciliation'),
};  
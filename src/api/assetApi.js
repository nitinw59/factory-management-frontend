import api from '../utils/api';

export const assetApi = {

    // ================================
    // ASSET TYPES
    // ================================

    getAllAssetTypes: () => api.get('assets/assets/types'),

    createAssetType: (typeData) =>
        api.post('assets/assets/types', typeData),

    // ================================
    // ASSETS
    // ================================

    getAllAssets: () => api.get('assets/assets'),

    getAssetByQrId: (qrId) =>
        api.get(`assets/assets/by-qr/${qrId}`),

    createAsset: (assetData) =>
        api.post('assets/assets', assetData),

    updateAsset: (assetId, assetData) =>
        api.put(`assets/assets/${assetId}`, assetData),

    decommissionAsset: (assetId) =>
        api.delete(`assets/assets/${assetId}`),

    // ================================
    // IMPORT / EXPORT
    // ================================

    exportAssets: () =>
        api.get('assets/assets-export'),

    bulkImportAssets: (data) =>
        api.post('assets/assets-bulk-import', { assets: data }),

    // ================================
    // SUPPLIERS
    // ================================

    getSuppliers: () =>
        api.get('shared/supplier'),

    getMyComplaints: () => api.get('/line-manager/complaints/my'),
};
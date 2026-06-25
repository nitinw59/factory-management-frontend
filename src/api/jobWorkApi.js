import api from '../utils/api';

export const jobWorkApi = {
    getPendingGarments: (batchId) =>
        api.get(`/job-work/batch/${batchId}/pending-garments`),

    createChallan: (data) =>
        api.post('/job-work/challan', data),

    sendChallan: (challanId) =>
        api.patch(`/job-work/challan/${challanId}/send`),

    receiveChallan: (challanId, items, vendorDcNumber, vehicleNumber, notes) =>
        api.post(`/job-work/challan/${challanId}/receive`, {
            items,
            ...(vendorDcNumber && { vendor_dc_number: vendorDcNumber }),
            ...(vehicleNumber  && { vehicle_number: vehicleNumber }),
            ...(notes          && { notes }),
        }),

    getChallan: (challanId) =>
        api.get(`/job-work/challan/${challanId}`),

    getBatchChallans: (batchId) =>
        api.get(`/job-work/batch/${batchId}`),

    // GET /job-work/challan — supports ?batch_id= and/or ?status=DRAFT|SENT|RECEIVED
    getChallans: (params = {}) =>
        api.get('/job-work/challan', { params }),

    getReceiverDashboard: () =>
        api.get('/job-work/receiver/dashboard'),

    getGrnForBatch: (batchId) =>
        api.get(`/job-work/grn/batch/${batchId}`),

    getGrn: (grnId) =>
        api.get(`/job-work/grn/${grnId}`),
};

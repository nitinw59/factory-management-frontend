// api/preparationPortalApi.js (or wherever your API file is located)
import api from '../utils/api';

const preparationUnloadApi = {
     getMyQueue: () => api.get('/preparation-unload/my-queue'),
     getPreparationDetails: (batchId) => api.get(`/preparation-unload/details/${batchId}`),
     completePreparationPiece: (data) => api.post('/preparation-unload/complete-piece', data),
     completePiecesBulk: (data) => api.post('/preparation-unload/complete-pieces-bulk', data),
};


export default preparationUnloadApi;
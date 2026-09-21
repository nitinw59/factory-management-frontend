import api from '../utils/api';

// Deliberately unauthenticated endpoints — see backend routes/publicRoutes.js.
// Safe to call from a page with nobody logged in (a factory-floor kiosk
// display); the shared `api` instance still works fine here since it only
// *optionally* attaches a token if one happens to exist, which the backend
// ignores on these routes either way.
export const publicApi = {
    getWorkstationScorecard: () => api.get('/public/workstation-scorecard'),
};

// The signed-in user's 3.0 view (GET /api/v3/me): roles (own + granted), menu, home,
// floor layout or not. Loaded once by V3Layout and shared with the pages.
import { createContext, useContext } from 'react';

export const V3AccessContext = createContext(null);
export const useV3Access = () => useContext(V3AccessContext);

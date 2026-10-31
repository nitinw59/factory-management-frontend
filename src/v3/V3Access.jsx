// The signed-in user's 3.0 view (GET /api/v3/me): roles (own + granted), menu, home,
// floor layout or not. Loaded once by V3Layout and shared with the pages.
import { createContext, useContext } from 'react';

export const V3AccessContext = createContext(null);
export const useV3Access = () => useContext(V3AccessContext);
// Prices (rates, values, stock value, bills): not for the stores (29 Oct 2026) — the API leaves them out, the screens hide
// their columns. True when unknown (outside the 3.0 layout).
export const useSeesPrices = () => useContext(V3AccessContext)?.me?.sees_prices !== false;
// May the user open this page (menu key)? True when unknown.
export const useCanOpen = (key) => useContext(V3AccessContext)?.me?.menu?.[key] !== false;

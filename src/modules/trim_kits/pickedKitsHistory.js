// Local record of kits this loader has signed for, kept on the device.
// The register at GET /trim-kits/history is the source of truth (see KitHistoryPage); this
// is just a per-device shortlist so a kit doesn't vanish off the queue the moment it's signed.
// Entries carry issue_id — enough to pull the real slip back from the register on demand.
const KEY = 'trimkits_picked_history';
const MAX = 40;

export const getPickedKits = () => {
    try {
        const raw = JSON.parse(localStorage.getItem(KEY) || '[]');
        return Array.isArray(raw) ? raw : [];
    } catch {
        return [];
    }
};

export const recordPickedKit = (entry) => {
    if (!entry?.orderId) return;
    try {
        const list = getPickedKits().filter(e => !(String(e.orderId) === String(entry.orderId) && e.issue_number === entry.issue_number));
        localStorage.setItem(KEY, JSON.stringify([entry, ...list].slice(0, MAX)));
    } catch {
        /* storage unavailable — history is best-effort */
    }
};

export const clearPickedKits = () => {
    try { localStorage.removeItem(KEY); } catch { /* ignore */ }
};

// Single source of truth for trim_order_status badges across store, loader and PM screens.
// COMPLETED means "fully allocated, not yet handed over" — the terminal state is ISSUED.
export const KIT_STATUS_CONFIG = {
    PENDING: { label: 'Pending', badge: 'bg-yellow-100 text-yellow-800 border-yellow-200', dot: 'bg-yellow-500' },
    PREPARED: { label: 'Prepared (legacy)', badge: 'bg-blue-100 text-blue-800 border-blue-200', dot: 'bg-blue-500' },
    COMPLETED: { label: 'Allocated', badge: 'bg-teal-100 text-teal-800 border-teal-200', dot: 'bg-teal-500' },
    READY_FOR_PICKUP: { label: 'Ready for Pickup', badge: 'bg-indigo-100 text-indigo-800 border-indigo-200', dot: 'bg-indigo-500' },
    PARTIALLY_ISSUED: { label: 'Partially Issued', badge: 'bg-purple-100 text-purple-800 border-purple-200', dot: 'bg-purple-500' },
    ISSUED: { label: 'Issued', badge: 'bg-green-100 text-green-800 border-green-200', dot: 'bg-green-500' },
};

export const kitStatusOf = (status) =>
    KIT_STATUS_CONFIG[status] || { label: status || 'Unknown', badge: 'bg-gray-100 text-gray-700 border-gray-200', dot: 'bg-gray-400' };

// Batch label — show the human batch code AND the numeric batch id together, everywhere in trim kits.
// Prefers the production batch id; falls back to the trim-order id when the batch isn't on the payload.
export const kitBatchLabel = (kit) => {
    const id = kit?.production_batch_id ?? kit?.batch_id ?? kit?.id;
    return kit?.batch_code ? `${kit.batch_code} · #${id}` : `#${id}`;
};

// Exchange (post-signing trim swap) lifecycle.
export const EXCHANGE_STATUS_CONFIG = {
    PENDING_SIGNATURE: { label: 'Awaiting loader signature', badge: 'bg-amber-100 text-amber-800 border-amber-200' },
    SIGNED: { label: 'Signed', badge: 'bg-green-100 text-green-800 border-green-200' },
    CANCELLED: { label: 'Cancelled', badge: 'bg-gray-100 text-gray-600 border-gray-200' },
};

export const exchangeStatusOf = (status) =>
    EXCHANGE_STATUS_CONFIG[status] || { label: status || 'Unknown', badge: 'bg-gray-100 text-gray-700 border-gray-200' };

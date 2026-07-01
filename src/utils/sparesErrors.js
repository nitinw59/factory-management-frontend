const CODE_MESSAGES = {
    // POST /spares
    NAME_REQUIRED:          'Spare name is required.',
    INVALID_UNIT_COST:      'Unit cost must be a non-negative number.',
    INVALID_STOCK:          'Current stock must be a non-negative number.',
    INVALID_CATEGORY:       'Category does not exist.',
    // PUT /spares/:id
    NO_FIELDS:              'No changes were provided.',
    INVALID_NAME:           'Name cannot be empty.',
    INVALID_THRESHOLD:      'Min stock threshold must be a non-negative number.',
    SPARE_NOT_FOUND:        'Spare part not found.',
    // Shared (POST /spares + PUT /spares/:id)
    DUPLICATE_PART_NUMBER:  'This part number is already taken by another spare.',
    // POST /spares/request
    NO_ITEMS:               'Add at least one item to the request.',
    MISSING_SPARE_PART_ID:  'Each item must have a spare part selected.',
    INVALID_QTY:            'All quantities must be greater than zero.',
    INVALID_SPARE_PART_ID:  'One or more selected spare parts do not exist.',
    // POST /spares/requests/:id/issue
    MISSING_ITEM_ID:        'Each entry must reference a valid request item.',
    REQUEST_NOT_FOUND:      'Request not found.',
    REQUEST_ITEM_NOT_FOUND: 'One or more request items could not be found.',
    // INSUFFICIENT_STOCK intentionally omitted — backend message includes part name + qty
    // GET /spares/:id/drilldown — SPARE_NOT_FOUND already covered above
    // All endpoints
    SERVER_ERROR:           'An unexpected server error occurred. Please try again.',
};

/**
 * Returns a user-friendly message for a spares API error.
 * Falls back to the backend `error` string, then the JS error message.
 */
export function sparesErrorMessage(err, fallback = 'An unexpected error occurred.') {
    const code    = err?.response?.data?.code;
    const backend = err?.response?.data?.error || err?.response?.data?.message;

    if (code && CODE_MESSAGES[code]) return CODE_MESSAGES[code];
    // INSUFFICIENT_STOCK: backend message already says which part + how much is available
    if (code === 'INSUFFICIENT_STOCK') return backend || 'Insufficient stock to fulfill this request.';
    return backend || err?.message || fallback;
}

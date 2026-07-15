import React from 'react';

// Resolve the production batch id from a kit / history row / order payload.
export const batchIdOf = (o) => o?.production_batch_id ?? o?.batch_id ?? o?.id;

// Batch code alongside a highlighted #id pill — used everywhere batch is shown in the kit screens.
export const BatchTag = ({ code, id, className = '' }) => (
    <span className={`inline-flex items-center gap-1.5 align-middle ${className}`}>
        {code ? <span className="font-semibold">{code}</span> : null}
        {(id != null && id !== '') ? (
            <span className="font-mono font-bold text-indigo-700 bg-indigo-100 border border-indigo-200 rounded px-1.5 py-0.5 text-[0.8em] leading-none">#{id}</span>
        ) : (!code ? <span className="text-gray-400">—</span> : null)}
    </span>
);

export default BatchTag;

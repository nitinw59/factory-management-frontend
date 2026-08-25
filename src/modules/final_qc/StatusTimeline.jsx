import React from 'react';
import { inspectionStatusOf } from './finalQcStatusConfig';

const fmtDateTime = (d) => d ? new Date(d).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—';

// Vertical timeline built from an inspection's status_history[] (oldest first,
// per the API spec's example — chronological, newest last).
const StatusTimeline = ({ history = [] }) => {
    const rows = Array.isArray(history) ? history : [];
    if (rows.length === 0) {
        return <p className="text-sm text-gray-400 font-medium py-2">No status changes recorded yet.</p>;
    }
    return (
        <ol className="relative">
            {rows.map((h, i) => {
                const meta = inspectionStatusOf(h.to_status);
                const last = i === rows.length - 1;
                return (
                    <li key={i} className="flex gap-3 pb-4 last:pb-0">
                        <div className="flex flex-col items-center">
                            <span className={`w-3 h-3 rounded-full shrink-0 mt-1 ${meta.dot} ring-4 ring-white`} />
                            {!last && <span className="w-px flex-1 bg-gray-200 my-1" />}
                        </div>
                        <div className="flex-1 min-w-0 -mt-0.5">
                            <div className="flex items-center gap-2 flex-wrap">
                                {h.from_status && (
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                                        {inspectionStatusOf(h.from_status).label} →
                                    </span>
                                )}
                                <span className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full border ${meta.badge}`}>{meta.label}</span>
                                <span className="text-xs text-gray-400">{fmtDateTime(h.changed_at)}</span>
                            </div>
                            {h.changed_by_name && <p className="text-xs text-gray-600 mt-1 font-medium">by {h.changed_by_name}</p>}
                            {h.notes && <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">{h.notes}</p>}
                        </div>
                    </li>
                );
            })}
        </ol>
    );
};

export default StatusTimeline;

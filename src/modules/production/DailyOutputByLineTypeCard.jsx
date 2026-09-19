// Daily production, one row per date, one column per production line type.
// Pulls each line type's own by_day series (already zero-filled across the
// range by getRangeSummary) and pivots them into a single date × type grid —
// no new backend endpoint, just the same per-type call the rest of this page
// already makes, once per type instead of once for the selected type.

const fmtDate = (iso) =>
    new Date(iso + 'T12:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

export default function DailyOutputByLineTypeCard({ lineTypes = [], seriesByType, loading }) {
    if (loading && !seriesByType) {
        return (
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 text-center text-gray-600">
                Loading daily output…
            </div>
        );
    }
    if (!seriesByType || lineTypes.length === 0) {
        return (
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 text-center text-gray-600">
                No production line types configured.
            </div>
        );
    }

    // Union of dates across every type's by_day (all calls share the same
    // start/end, so in practice this is just the first non-empty series —
    // union guards against one type's call having failed and come back empty).
    const dateSet = new Set();
    lineTypes.forEach(t => (seriesByType[t.id] || []).forEach(d => dateSet.add(d.date)));
    const dates = [...dateSet].sort((a, b) => (a < b ? 1 : -1)); // newest first

    const valueAt = (typeId, date) => {
        const row = (seriesByType[typeId] || []).find(d => d.date === date);
        return row ? row.total_output : 0;
    };

    const columnTotal = (typeId) => (seriesByType[typeId] || []).reduce((s, d) => s + (d.total_output || 0), 0);
    const rowTotal = (date) => lineTypes.reduce((s, t) => s + valueAt(t.id, date), 0);
    const grandTotal = lineTypes.reduce((s, t) => s + columnTotal(t.id), 0);

    return (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
            <div className="px-6 py-5 border-b border-gray-800">
                <p className="text-xs text-gray-500 uppercase tracking-widest font-bold mb-1">
                    Daily Output — By Production Line Type
                </p>
                <h2 className="text-xl font-black text-white">
                    {dates.length > 0 ? `${fmtDate(dates[dates.length - 1])} – ${fmtDate(dates[0])}` : '—'}
                </h2>
            </div>

            {dates.length === 0 ? (
                <p className="text-base text-gray-600 italic py-8 text-center">No output recorded for this period.</p>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse min-w-[640px]">
                        <thead>
                            <tr className="text-[11px] text-gray-600 uppercase tracking-widest">
                                <th className="px-6 py-3 font-bold sticky left-0 bg-gray-900">Date</th>
                                {lineTypes.map(t => (
                                    <th key={t.id} className="px-4 py-3 font-bold text-right whitespace-nowrap">{t.type_name}</th>
                                ))}
                                <th className="px-6 py-3 font-bold text-right">Total</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800/60">
                            {dates.map(date => (
                                <tr key={date} className="hover:bg-gray-800/30">
                                    <td className="px-6 py-2.5 text-sm font-bold text-white whitespace-nowrap sticky left-0 bg-gray-900">
                                        {fmtDate(date)}
                                    </td>
                                    {lineTypes.map(t => {
                                        const v = valueAt(t.id, date);
                                        return (
                                            <td key={t.id} className="px-4 py-2.5 text-sm text-right tabular-nums"
                                                style={{ color: v > 0 ? '#d1d5db' : '#4b5563' }}>
                                                {v > 0 ? v.toLocaleString() : '—'}
                                            </td>
                                        );
                                    })}
                                    <td className="px-6 py-2.5 text-sm font-black text-right tabular-nums text-indigo-400">
                                        {rowTotal(date).toLocaleString()}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot>
                            <tr className="border-t-2 border-gray-800">
                                <td className="px-6 py-3 text-sm font-black text-gray-400 sticky left-0 bg-gray-900">Total</td>
                                {lineTypes.map(t => (
                                    <td key={t.id} className="px-4 py-3 text-sm font-black text-right tabular-nums text-gray-300">
                                        {columnTotal(t.id).toLocaleString()}
                                    </td>
                                ))}
                                <td className="px-6 py-3 text-sm font-black text-right tabular-nums text-indigo-400">
                                    {grandTotal.toLocaleString()}
                                </td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            )}
        </div>
    );
}

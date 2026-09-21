// One row per active workstation — today's approved / repaired / rework /
// rejected breakdown and this hour's checked count for whoever's logged in
// there. Same definition as the individual checker's own live stat bar
// (getCheckerStats), just laid out for every workstation at once so an admin
// can scan the whole factory floor. Pushed live: the parent page re-fetches
// this data whenever a QC_LIVE_EVENT websocket broadcast arrives (see
// useLiveQcSocket / utils/liveQc.js), not on a fixed poll timer.

const fmtCount = (n, cls) =>
    n == null ? <span className="text-sm text-gray-700">—</span>
              : <span className={`text-sm font-black tabular-nums ${n > 0 ? cls : 'text-gray-600'}`}>{n.toLocaleString()}</span>;

export default function WorkstationLiveScorecard({ rows, loading, live }) {
    if (loading && !rows) {
        return (
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 text-center text-gray-600">
                Loading workstation scorecard…
            </div>
        );
    }
    if (!rows || rows.length === 0) {
        return (
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 text-center text-gray-600">
                No active workstations configured.
            </div>
        );
    }

    const totalToday = rows.reduce((s, w) => s + (w.today_output || 0), 0);

    return (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
            <div className="px-6 py-5 border-b border-gray-800">
                <div className="flex items-center justify-between flex-wrap gap-4">
                    <div>
                        <p className="text-xs text-gray-500 uppercase tracking-widest font-bold mb-1 flex items-center gap-1.5">
                            Live Scorecard — By Workstation
                            <span
                                className={`inline-flex items-center gap-1 normal-case tracking-normal font-bold px-1.5 py-0.5 rounded ${live ? 'text-emerald-400' : 'text-gray-600'}`}
                                title={live ? 'Live — updates instantly on every check-in' : 'Reconnecting…'}
                            >
                                <span className={`h-1.5 w-1.5 rounded-full ${live ? 'bg-emerald-400 animate-pulse' : 'bg-gray-600'}`} />
                                {live ? 'Live' : 'Offline'}
                            </span>
                        </p>
                        <h2 className="text-xl font-black text-white">Today's Output</h2>
                    </div>
                    <div className="text-center">
                        <p className="text-xs text-gray-500 uppercase tracking-wide mb-0.5">Factory Total</p>
                        <span className="text-2xl font-black text-white tabular-nums">
                            {totalToday.toLocaleString()}
                        </span>
                    </div>
                </div>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="text-[11px] text-gray-600 uppercase tracking-widest">
                            <th className="px-6 py-3 font-bold">Workstation</th>
                            <th className="px-4 py-3 font-bold">Operator</th>
                            <th className="px-4 py-3 font-bold">Line</th>
                            <th className="px-4 py-3 font-bold">Line Type</th>
                            <th className="px-4 py-3 font-bold text-right">Approved</th>
                            <th className="px-4 py-3 font-bold text-right">Repaired</th>
                            <th className="px-4 py-3 font-bold text-right">Rework</th>
                            <th className="px-4 py-3 font-bold text-right">Rejected</th>
                            <th className="px-4 py-3 font-bold text-right">Today</th>
                            <th className="px-6 py-3 font-bold text-right">This Hour</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800/60">
                        {rows.map(w => {
                            const unmanned = !w.user_name;
                            const noOutput = w.today_output == null;
                            const noChecked = w.checked_this_hour == null;
                            return (
                                <tr key={w.workstation_id} className="hover:bg-gray-800/30">
                                    <td className="px-6 py-2.5 text-sm font-bold text-white whitespace-nowrap">
                                        {w.workstation_name}
                                    </td>
                                    <td className="px-4 py-2.5 text-sm whitespace-nowrap"
                                        style={{ color: unmanned ? '#4b5563' : '#d1d5db' }}>
                                        {w.user_name || 'Unassigned'}
                                    </td>
                                    <td className="px-4 py-2.5 text-sm text-gray-500 whitespace-nowrap">
                                        {w.line_name || '—'}
                                    </td>
                                    <td className="px-4 py-2.5 text-sm text-gray-500 whitespace-nowrap">
                                        {w.line_type_name || '—'}
                                    </td>
                                    <td className="px-4 py-2.5 text-right tabular-nums">{fmtCount(w.today_approved, 'text-emerald-400')}</td>
                                    <td className="px-4 py-2.5 text-right tabular-nums">{fmtCount(w.today_repaired, 'text-amber-400')}</td>
                                    <td className="px-4 py-2.5 text-right tabular-nums">{fmtCount(w.today_rework, 'text-orange-400')}</td>
                                    <td className="px-4 py-2.5 text-right tabular-nums">{fmtCount(w.today_rejected, 'text-red-400')}</td>
                                    <td className="px-4 py-2.5 text-right tabular-nums">
                                        {noOutput ? (
                                            <span className="text-sm text-gray-700">—</span>
                                        ) : (
                                            <span className={`text-sm font-black ${w.today_output > 0 ? 'text-emerald-400' : 'text-gray-600'}`}>
                                                {w.today_output.toLocaleString()}
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-6 py-2.5 text-right tabular-nums">
                                        {noChecked ? (
                                            <span className="text-sm text-gray-700">—</span>
                                        ) : (
                                            <span className="text-sm text-gray-400">
                                                {w.checked_this_hour.toLocaleString()}
                                            </span>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

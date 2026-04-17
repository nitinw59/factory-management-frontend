import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
    LuLogOut, LuClipboardCheck, LuLayoutGrid, LuMenu, LuX,
    LuFileText, LuHammer, LuCircleCheck, LuDownload, LuLoader,
    LuThumbsUp, LuClock, LuLayers, LuChevronRight,
} from 'react-icons/lu';
import { universalApi } from '../api/universalApi';

const STATS_REFRESH_MS = 60_000;

// ── Helpers ────────────────────────────────────────────────────────────────────

const ACTION_STYLE = {
    APPROVED:     'bg-emerald-100 text-emerald-700',
    NEEDS_REWORK: 'bg-amber-100  text-amber-700',
    QC_REJECTED:  'bg-red-100    text-red-700',
    REPAIRED:     'bg-teal-100   text-teal-700',
};
const ActionBadge = ({ action }) => (
    <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wide whitespace-nowrap ${ACTION_STYLE[action] ?? 'bg-gray-100 text-gray-600'}`}>
        {action?.replace(/_/g, ' ') ?? '—'}
    </span>
);

const fmtTime = (iso) => {
    if (!iso) return '—';
    try {
        return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch { return iso; }
};

// Merge rows + defect_logs into a single sorted list
function mergeWorkData(data) {
    if (!data) return [];
    const scans = (data.rows || []).map(r => ({ ...r, _type: 'scan' }));
    const defects = (data.defect_logs || []).map(d => ({
        time:               d.time,
        batch_id:           d.batch_id,
        batch_code:         d.batch_code,
        part_name:          d.part_name,
        size:               d.size,
        fabric_roll_id:     d.fabric_roll_id,
        piece_sequence:     d.piece_sequence,
        action:             d.severity,
        defect_code:        d.defect_code,
        defect_description: d.defect_description,
        is_resolved:        d.is_resolved,
        _type:              'defect',
    }));
    return [...scans, ...defects].sort((a, b) => new Date(a.time) - new Date(b.time));
}

// ── Work Log Modal ─────────────────────────────────────────────────────────────

const WorkLogModal = ({ workData, loading, onClose, onDateChange, onExport }) => {
    const [mode,       setMode]       = useState('hourly'); // 'hourly' | 'roll'
    const [openGroups, setOpenGroups] = useState(new Set());
    const [modalDate,  setModalDate]  = useState(
        workData?.date ?? new Date().toISOString().split('T')[0]
    );

    const merged = useMemo(() => mergeWorkData(workData), [workData]);

    const top3Defects = useMemo(() => {
        const logs = workData?.defect_logs ?? [];
        const freq = {};
        logs.forEach(d => {
            const key = d.defect_code ?? '—';
            if (!freq[key]) freq[key] = { code: d.defect_code, description: d.defect_description, count: 0 };
            freq[key].count += 1;
        });
        return Object.values(freq).sort((a, b) => b.count - a.count).slice(0, 3);
    }, [workData]);

    const grouped = useMemo(() => {
        const groups = {};
        merged.forEach(row => {
            const key = mode === 'hourly'
                ? (() => {
                    const h = new Date(row.time).getHours();
                    return `${String(h).padStart(2, '0')}:00 – ${String(h + 1).padStart(2, '0')}:00`;
                  })()
                : `Roll #${row.fabric_roll_id ?? 'Unknown'}`;
            if (!groups[key]) groups[key] = [];
            groups[key].push(row);
        });
        return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
    }, [merged, mode]);

    // Reset open groups when mode or data changes
    useEffect(() => { setOpenGroups(new Set()); }, [mode, workData]);

    const toggleGroup = (key) => {
        setOpenGroups(prev => {
            const next = new Set(prev);
            next.has(key) ? next.delete(key) : next.add(key);
            return next;
        });
    };

    const handleDateChange = (e) => {
        const d = e.target.value;
        setModalDate(d);
        onDateChange(d);
    };

    return (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
             onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden"
                 onClick={e => e.stopPropagation()}>

                {/* ── Modal header ── */}
                <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 border-b border-gray-100">
                    <div className="flex items-center gap-3">
                        <div>
                            <h2 className="text-base font-black text-gray-900">Work Log</h2>
                            <p className="text-xs text-gray-400">{merged.length} entries · {grouped.length} groups</p>
                        </div>
                        <input
                            type="date"
                            value={modalDate}
                            onChange={handleDateChange}
                            className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-indigo-400 bg-gray-50"
                        />
                    </div>

                    <div className="flex items-center gap-2">
                        <div className="flex bg-gray-100 rounded-lg p-0.5">
                            <button
                                onClick={() => setMode('hourly')}
                                className={`flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-md transition ${mode === 'hourly' ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                                <LuClock size={11} /> Hourly
                            </button>
                            <button
                                onClick={() => setMode('roll')}
                                className={`flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-md transition ${mode === 'roll' ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                                <LuLayers size={11} /> Fabric Roll
                            </button>
                        </div>
                        <button
                            onClick={() => onExport(grouped, mode, modalDate)}
                            disabled={!grouped.length}
                            className="flex items-center gap-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 px-3 py-1.5 rounded-lg transition shadow-sm disabled:opacity-40"
                        >
                            <LuDownload size={12} /> Export CSV
                        </button>
                        <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-full transition">
                            <LuX size={16} className="text-gray-500" />
                        </button>
                    </div>
                </div>

                {/* ── Top rework reasons ── */}
                {!loading && top3Defects.length > 0 && (
                    <div className="px-5 py-2.5 bg-amber-50 border-b border-amber-100 flex flex-wrap items-center gap-3">
                        <span className="text-xs font-bold text-amber-700 shrink-0">Top Rework Reasons:</span>
                        {top3Defects.map((d, i) => (
                            <div key={d.code} className="flex items-center gap-1.5 bg-white border border-amber-200 rounded-lg px-2.5 py-1 shadow-sm">
                                <span className="text-sm">{['🥇','🥈','🥉'][i]}</span>
                                <span className="text-xs font-black text-gray-700 font-mono">{d.code}</span>
                                {d.description && <span className="text-xs text-gray-500 hidden sm:inline">— {d.description}</span>}
                                <span className="ml-1 text-xs font-bold text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded-full">{d.count}×</span>
                            </div>
                        ))}
                    </div>
                )}

                {/* ── Body ── */}
                <div className="overflow-auto flex-1 p-4">
                    {loading ? (
                        <div className="flex items-center justify-center py-20 text-gray-400 gap-2">
                            <LuLoader size={18} className="animate-spin" />
                            <span className="text-sm">Loading…</span>
                        </div>
                    ) : merged.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                            <LuCircleCheck size={36} className="mb-2 opacity-30" />
                            <p className="text-sm font-medium">No work logged for this date.</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {grouped.map(([groupKey, groupRows]) => {
                                const approved  = groupRows.filter(r => r.action === 'APPROVED').length;
                                const rework    = groupRows.filter(r => r.action === 'NEEDS_REWORK').length;
                                const repaired  = groupRows.filter(r => r.action === 'REPAIRED').length;
                                const rejected  = groupRows.filter(r => r.action === 'QC_REJECTED').length;
                                const isOpen    = openGroups.has(groupKey);

                                return (
                                    <div key={groupKey} className="border border-gray-200 rounded-xl overflow-hidden">
                                        {/* Accordion header — always visible, click to toggle */}
                                        <button
                                            type="button"
                                            onClick={() => toggleGroup(groupKey)}
                                            className="w-full bg-gray-50 hover:bg-gray-100 px-4 py-2.5 flex items-center justify-between transition text-left"
                                        >
                                            <div className="flex items-center gap-2">
                                                <LuChevronRight
                                                    size={14}
                                                    className={`text-gray-400 transition-transform shrink-0 ${isOpen ? 'rotate-90' : ''}`}
                                                />
                                                <span className="font-black text-gray-700 text-sm">{groupKey}</span>
                                            </div>
                                            <div className="flex items-center gap-3 text-xs font-semibold">
                                                {approved  > 0 && <span className="text-emerald-600">{approved} approved</span>}
                                                {repaired  > 0 && <span className="text-teal-600">{repaired} repaired</span>}
                                                {rework    > 0 && <span className="text-amber-600">{rework} rework</span>}
                                                {rejected  > 0 && <span className="text-red-600">{rejected} rejected</span>}
                                                <span className="text-gray-400 font-normal">{groupRows.length} total</span>
                                            </div>
                                        </button>

                                        {/* Collapsible detail table */}
                                        {isOpen && (
                                            <table className="w-full text-xs border-t border-gray-100">
                                                <tbody>
                                                    {groupRows.map((r, i) => (
                                                        <tr key={i} className={`border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors ${r._type === 'defect' ? 'bg-amber-50/40' : ''}`}>
                                                            <td className="px-3 py-2 font-mono text-gray-400 whitespace-nowrap">{fmtTime(r.time)}</td>
                                                            <td className="px-3 py-2 font-semibold text-gray-800 whitespace-nowrap">{r.batch_code}</td>
                                                            <td className="px-3 py-2 text-gray-600 capitalize">{r.part_name}</td>
                                                            <td className="px-3 py-2 text-gray-500">Sz {r.size}</td>
                                                            {mode === 'hourly' && (
                                                                <td className="px-3 py-2 text-gray-500 font-mono">Roll #{r.fabric_roll_id ?? '—'}</td>
                                                            )}
                                                            <td className="px-3 py-2 text-gray-500 font-mono">#{r.piece_sequence}</td>
                                                            <td className="px-3 py-2"><ActionBadge action={r.action} /></td>
                                                            <td className="px-3 py-2">
                                                                {r.defect_code && (
                                                                    <div>
                                                                        <span className="font-mono text-gray-600">{r.defect_code}</span>
                                                                        {r.defect_description && (
                                                                            <span className="block text-gray-400 text-[10px]">{r.defect_description}</span>
                                                                        )}
                                                                    </div>
                                                                )}
                                                            </td>
                                                            {r._type === 'defect' && (
                                                                <td className="px-3 py-2">
                                                                    <span className={`font-semibold ${r.is_resolved ? 'text-emerald-500' : 'text-amber-500'}`}>
                                                                        {r.is_resolved ? '✓ Resolved' : '⏳ Pending'}
                                                                    </span>
                                                                </td>
                                                            )}
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

// ── Layout ─────────────────────────────────────────────────────────────────────

const NumberingPortalLayout = () => {
    const { user, logout } = useAuth();
    const navigate = useNavigate();

    const [showNav,     setShowNav]     = useState(false);
    const [stats,       setStats]       = useState(null);
    const [showModal,   setShowModal]   = useState(false);
    const [workData,    setWorkData]    = useState(null);   // { date, rows, defect_logs }
    const [loadingWork, setLoadingWork] = useState(false);

    const handleLogout = () => { logout(); navigate('/login'); };

    // ── Stats (auto-refresh) ──────────────────────────────────────────────────
    const loadStats = useCallback(async () => {
        try {
            const res = await universalApi.getCheckerStats();
            setStats(res.data);
        } catch { /* silently ignore */ }
    }, []);

    useEffect(() => {
        loadStats();
        const interval = setInterval(loadStats, STATS_REFRESH_MS);
        return () => clearInterval(interval);
    }, [loadStats]);

    // ── Fetch work log for a date ─────────────────────────────────────────────
    const fetchWork = useCallback(async (date) => {
        setLoadingWork(true);
        try {
            const res = await universalApi.getTodayWork(date);
            setWorkData(res.data);
        } catch {
            alert('Failed to load work log.');
        } finally {
            setLoadingWork(false);
        }
    }, []);

    const handleOpenModal = () => {
        setShowModal(true);
        if (workData === null) {
            fetchWork(new Date().toISOString().split('T')[0]);
        }
    };

    const handleModalDateChange = (date) => {
        setWorkData(null); // clear while loading
        fetchWork(date);
    };

    // ── CSV export (summary per group) ───────────────────────────────────────
    const downloadCSV = (grouped, mode, date) => {
        if (!grouped?.length) return;
        const modeLabel = mode === 'hourly' ? 'hour' : 'fabric_roll';
        const header = `sr_no,${modeLabel},total,approved,repaired,needs_rework,qc_rejected`;
        const lines  = grouped.map(([groupKey, rows], i) => [
            i + 1,
            `"${groupKey}"`,
            rows.length,
            rows.filter(r => r.action === 'APPROVED').length,
            rows.filter(r => r.action === 'REPAIRED').length,
            rows.filter(r => r.action === 'NEEDS_REWORK').length,
            rows.filter(r => r.action === 'QC_REJECTED').length,
        ].join(','));
        const csv  = [header, ...lines].join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href     = url;
        a.download = `work-log-${mode}-${date ?? new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <div className="flex flex-col h-screen bg-gray-50">
            <header className="bg-white shadow-sm sticky top-0 z-20 border-b border-gray-100">

                {/* Top bar */}
                <div className="px-4 py-2 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setShowNav(n => !n)}
                            title={showNav ? 'Hide navigation' : 'Show navigation'}
                            className="w-8 h-8 rounded-full border-2 border-gray-300 bg-white hover:bg-gray-50 flex items-center justify-center shadow-sm transition shrink-0"
                        >
                            {showNav ? <LuX size={14} className="text-gray-600" /> : <LuMenu size={14} className="text-gray-600" />}
                        </button>
                        <span className="text-base font-bold text-gray-800">Workstation</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <span className="text-sm text-gray-500 hidden sm:block">{user?.name}</span>
                        <button onClick={handleLogout} className="flex items-center text-sm text-gray-600 hover:text-red-600">
                            <LuLogOut className="mr-1" size={14} /> Logout
                        </button>
                    </div>
                </div>

                {/* Summary bar */}
                <div className="px-4 py-1.5 bg-gray-50 border-t border-gray-100 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-4 flex-wrap">
                        <div className="flex items-center gap-1.5">
                            <LuHammer size={13} className="text-amber-500 shrink-0" />
                            <span className="text-xs text-gray-500">Pending Rework</span>
                            <span className={`text-sm font-black tabular-nums ${
                                stats == null ? 'text-gray-400' :
                                stats.pending_rework > 0 ? 'text-amber-500' : 'text-emerald-600'
                            }`}>
                                {stats == null ? '—' : (stats.pending_rework ?? 0)}
                            </span>
                        </div>
                        <span className="text-gray-200 hidden sm:inline">│</span>
                        <div className="flex items-center gap-1.5">
                            <LuHammer size={13} className="text-indigo-400 shrink-0" />
                            <span className="text-xs text-gray-500">Today's Rework</span>
                            <span className="text-sm font-black tabular-nums text-indigo-600">
                                {stats == null ? '—' : (stats.today_rework ?? 0)}
                            </span>
                        </div>
                        <span className="text-gray-200 hidden sm:inline">│</span>
                        <div className="flex items-center gap-1.5">
                            <LuThumbsUp size={13} className="text-emerald-500 shrink-0" />
                            <span className="text-xs text-gray-500">Today's Approved</span>
                            <span className="text-sm font-black tabular-nums text-emerald-600">
                                {stats == null ? '—' : (stats.today_approved ?? 0)}
                            </span>
                        </div>
                    </div>

                    <button
                        onClick={handleOpenModal}
                        disabled={loadingWork && !showModal}
                        className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 hover:text-indigo-600 border border-gray-200 hover:border-indigo-300 px-3 py-1.5 rounded-lg transition disabled:opacity-50 bg-white shadow-sm"
                    >
                        {loadingWork && !showModal
                            ? <LuLoader size={12} className="animate-spin" />
                            : <LuFileText size={12} />}
                        Today's Work
                    </button>
                </div>

                {/* Collapsible nav */}
                {showNav && (
                    <nav className="border-t border-gray-100 px-6 py-2 flex flex-wrap items-center gap-5" onClick={() => setShowNav(false)}>
                        <NavLink to="/numbering-portal/dashboard"
                            className={({ isActive }) => `flex items-center text-sm font-medium ${isActive ? 'text-blue-600' : 'text-gray-600 hover:text-blue-600'}`}>
                            <LuClipboardCheck className="mr-1.5" size={14} /> My Numbering Queue
                        </NavLink>
                        <NavLink to="/numbering-portal/summary"
                            className={({ isActive }) => `flex items-center text-sm font-medium ${isActive ? 'text-blue-600' : 'text-gray-600 hover:text-blue-600'}`}>
                            <LuFileText className="mr-1.5" size={14} /> Batch QC Summary
                        </NavLink>
                        <NavLink to="/numbering-portal/sewing-machine-complaints"
                            className={({ isActive }) => `flex items-center text-sm font-medium ${isActive ? 'text-blue-600' : 'text-gray-600 hover:text-blue-600'}`}>
                            <LuLayoutGrid className="mr-1.5" size={14} /> Sewing Machine Complaints
                        </NavLink>
                    </nav>
                )}
            </header>

            <main className="flex-1 p-6 overflow-y-auto">
                <Outlet />
            </main>

            {showModal && (
                <WorkLogModal
                    workData={workData}
                    loading={loadingWork}
                    onClose={() => setShowModal(false)}
                    onDateChange={handleModalDateChange}
                    onExport={downloadCSV}
                />
            )}
        </div>
    );
};

export default NumberingPortalLayout;

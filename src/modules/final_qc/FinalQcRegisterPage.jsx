import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { finalQcApi } from '../../api/finalQcApi';
import { inspectionStatusOf, resultOf } from './finalQcStatusConfig';
import CreateFinalQcInspectionModal from './CreateFinalQcInspectionModal';
import {
    Loader2, RefreshCw, AlertCircle, ShieldCheck, Search, Inbox, ClipboardList, Plus, XCircle, ShieldAlert,
} from 'lucide-react';

const CREATE_ROLES = ['factory_admin', 'quality_manager', 'garment_checker', 'dispatch_officer'];

const fmtDateTime = (d) => d ? new Date(d).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—';

const KPICard = ({ title, count, icon: Icon, colorClass, bgColorClass }) => (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 flex items-center justify-between">
        <div>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">{title}</p>
            <p className="text-xl lg:text-2xl font-black text-gray-800">{count}</p>
        </div>
        <div className={`p-2.5 rounded-lg ${bgColorClass} ${colorClass}`}>
            <Icon size={20} />
        </div>
    </div>
);

const TABS = [
    { key: 'FAILED', label: 'Failed', status: 'FAILED' },
    { key: 'PASSED', label: 'Passed', status: 'PASSED' },
    { key: 'WAIVED', label: 'Waived', status: 'WAIVED' },
    { key: 'CLOSED', label: 'Closed', status: 'CLOSED' },
    { key: 'ALL', label: 'All', status: undefined },
];

const FinalQcRegisterPage = () => {
    const { user } = useAuth();
    const [tab, setTab] = useState('ALL');
    const [rows, setRows] = useState(null);
    const [error, setError] = useState(null);
    const [refreshing, setRefreshing] = useState(false);
    const [q, setQ] = useState('');
    const [showCreate, setShowCreate] = useState(false);

    const canCreate = CREATE_ROLES.includes(user?.role);

    const fetchRows = useCallback(async () => {
        setRefreshing(true);
        setError(null);
        try {
            const status = TABS.find(t => t.key === tab)?.status;
            const res = await finalQcApi.getInspections(status ? { status } : {});
            setRows(Array.isArray(res.data) ? res.data : (res.data?.data || []));
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to load final QC inspections.');
            setRows([]);
        } finally {
            setRefreshing(false);
        }
    }, [tab]);

    useEffect(() => { fetchRows(); }, [fetchRows]);

    const filtered = useMemo(() => {
        if (!rows) return null;
        const term = q.trim().toLowerCase();
        if (!term) return rows;
        return rows.filter(r =>
            [r.inspection_code, r.batch_code, r.inspected_by_name]
                .filter(Boolean).some(v => String(v).toLowerCase().includes(term))
        );
    }, [rows, q]);

    const kpis = useMemo(() => {
        const list = rows || [];
        return {
            total:  list.length,
            failed: list.filter(r => r.status === 'FAILED').length,
            waived: list.filter(r => r.status === 'WAIVED').length,
            passed: list.filter(r => r.status === 'PASSED').length,
        };
    }, [rows]);

    return (
        <div className="max-w-5xl mx-auto">
            <div className="flex items-center justify-between mb-5 gap-4">
                <div className="min-w-0">
                    <h1 className="text-2xl font-extrabold text-gray-900 flex items-center">
                        <ShieldCheck className="w-6 h-6 mr-3 text-indigo-600" /> Final QC Inspections
                    </h1>
                    <p className="text-sm text-gray-500 mt-1 font-medium">
                        Pre-dispatch AQL inspections — record, waive, and close per batch.
                    </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    {canCreate && (
                        <button
                            onClick={() => setShowCreate(true)}
                            className="flex items-center gap-1.5 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-bold shadow-sm transition-colors"
                        >
                            <Plus size={15} /> New Inspection
                        </button>
                    )}
                    <button onClick={fetchRows} disabled={refreshing} className="p-2.5 bg-white border border-gray-300 rounded-lg shadow-sm hover:bg-gray-50 text-gray-600 disabled:opacity-50" title="Refresh">
                        <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin text-indigo-600' : ''}`} />
                    </button>
                </div>
            </div>

            {/* KPI tiles */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
                <KPICard title="Total (loaded)" count={kpis.total} icon={ClipboardList} colorClass="text-indigo-600" bgColorClass="bg-indigo-50" />
                <KPICard title="Failed" count={kpis.failed} icon={XCircle} colorClass="text-red-600" bgColorClass="bg-red-50" />
                <KPICard title="Waived" count={kpis.waived} icon={ShieldAlert} colorClass="text-amber-600" bgColorClass="bg-amber-50" />
                <KPICard title="Passed" count={kpis.passed} icon={ShieldCheck} colorClass="text-emerald-600" bgColorClass="bg-emerald-50" />
            </div>

            {/* Status tabs */}
            <div className="flex items-center gap-1.5 mb-4 flex-wrap">
                {TABS.map(t => (
                    <button
                        key={t.key}
                        onClick={() => setTab(t.key)}
                        className={`px-3 py-1.5 rounded-lg text-sm font-bold transition-colors ${tab === t.key ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            {/* Search */}
            <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                    value={q}
                    onChange={e => setQ(e.target.value)}
                    placeholder="Search by inspection code, batch or inspector…"
                    className="w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                />
            </div>

            {error && (
                <div className="p-4 mb-4 bg-red-50 text-red-700 rounded-xl border border-red-200 flex items-center text-sm font-medium">
                    <AlertCircle className="h-5 w-5 mr-3 shrink-0" /> {error}
                </div>
            )}

            {filtered === null ? (
                <div className="flex justify-center p-16"><Loader2 className="animate-spin h-10 w-10 text-indigo-600" /></div>
            ) : filtered.length === 0 ? (
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-16 text-center">
                    <Inbox className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-600 font-bold">No inspections here</p>
                </div>
            ) : (
                <div className="space-y-2">
                    {filtered.map(r => {
                        const meta = inspectionStatusOf(r.status);
                        const rmeta = resultOf(r.result);
                        return (
                            <Link
                                key={r.id}
                                to={`/qa-portal/final-qc/${r.id}`}
                                className="block bg-white rounded-xl border border-gray-200 shadow-sm hover:border-indigo-300 transition-all px-4 py-3"
                            >
                                <div className="flex items-center justify-between gap-4">
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="font-mono font-bold text-gray-800">{r.inspection_code || `FQC-${r.id}`}</span>
                                            <span className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full border ${meta.badge}`}>{meta.label}</span>
                                            <span className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full border ${rmeta.badge}`}>{rmeta.label}</span>
                                        </div>
                                        <p className="text-sm text-gray-700 mt-1 truncate">
                                            {r.batch_code || `Batch #${r.production_batch_id}`}
                                            {r.defect_line_count != null && <span className="text-gray-400"> · {r.defect_line_count} defect line{r.defect_line_count === 1 ? '' : 's'}</span>}
                                        </p>
                                        <p className="text-xs text-gray-400 mt-0.5">
                                            {fmtDateTime(r.inspection_date)}
                                            {r.inspected_by_name && <> · {r.inspected_by_name}</>}
                                        </p>
                                    </div>
                                    <div className="text-right shrink-0 text-xs text-gray-400">
                                        Sample {r.sample_size}/{r.lot_size}
                                    </div>
                                </div>
                            </Link>
                        );
                    })}
                </div>
            )}

            {showCreate && (
                <CreateFinalQcInspectionModal
                    onClose={() => setShowCreate(false)}
                    onCreated={() => { setShowCreate(false); fetchRows(); }}
                />
            )}
        </div>
    );
};

export default FinalQcRegisterPage;

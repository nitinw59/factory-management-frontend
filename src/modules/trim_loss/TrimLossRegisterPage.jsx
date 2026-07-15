import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { trimLossApi } from '../../api/trimLossApi';
import { caseStatusOf } from './trimLossStatusConfig';
import { fmtDateTime, fmtMoney, variantText } from './format';
import {
    Loader2, RefreshCw, AlertCircle, PackageX, Search, Inbox, IndianRupee, ClipboardList, ShieldCheck,
} from 'lucide-react';

// KPI tile (mirrors TrimOrdersPage KPICard).
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

// Status tabs for the register — the first is the PM "open" queue.
const TABS = [
    { key: 'OPEN', label: 'Open queue', statuses: 'ESCALATED,UNDER_INVESTIGATION,RESPONSIBILITY_FIXED' },
    { key: 'DEBIT_APPROVED', label: 'Debit approved', statuses: 'DEBIT_APPROVED' },
    { key: 'CLOSED', label: 'Closed', statuses: 'CLOSED' },
    { key: 'ALL', label: 'All', statuses: 'ESCALATED,UNDER_INVESTIGATION,RESPONSIBILITY_FIXED,DEBIT_APPROVED,CLOSED,CANCELLED' },
];

const itemLabel = (r) => {
    const name = r.item_name || r.trim_item_name || '—';
    const v = variantText(r);
    return v ? `${name} — ${v}` : name;
};

const TrimLossRegisterPage = ({ nearMiss = false }) => {
    const [tab, setTab] = useState('OPEN');
    const [rows, setRows] = useState(null);
    const [error, setError] = useState(null);
    const [refreshing, setRefreshing] = useState(false);
    const [q, setQ] = useState('');

    const fetchRows = useCallback(async () => {
        setRefreshing(true);
        setError(null);
        try {
            let res;
            if (nearMiss) {
                res = await trimLossApi.getNearMisses({});
            } else {
                const statuses = TABS.find(t => t.key === tab)?.statuses;
                res = await trimLossApi.getCases({ status: statuses });
            }
            console.log('[trimloss] register rows raw:', res.data);
            setRows(Array.isArray(res.data) ? res.data : (res.data?.data || []));
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to load trim-loss cases.');
            setRows([]);
        } finally {
            setRefreshing(false);
        }
    }, [tab, nearMiss]);

    useEffect(() => { fetchRows(); }, [fetchRows]);

    const filtered = useMemo(() => {
        if (!rows) return null;
        const term = q.trim().toLowerCase();
        if (!term) return rows;
        return rows.filter(r =>
            [r.case_number, r.item_name, r.trim_item_name, r.issue_number, r.original_issue_number, r.production_line_name, r.line_name]
                .filter(Boolean).some(v => String(v).toLowerCase().includes(term))
        );
    }, [rows, q]);

    const kpis = useMemo(() => {
        const list = rows || [];
        const lossValue = list.reduce((s, r) => s + (Number(r.loss_value) || 0), 0);
        const outstanding = list.reduce((s, r) => s + (Number(r.outstanding_qty) || 0), 0);
        const recovered = list.reduce((s, r) => s + (Number(r.recovered_count) || 0), 0);
        return { count: list.length, lossValue, outstanding, recovered };
    }, [rows]);

    return (
        <div className="max-w-5xl mx-auto">
            <div className="flex items-center justify-between mb-5 gap-4">
                <div className="min-w-0">
                    <h1 className="text-2xl font-extrabold text-gray-900 flex items-center">
                        <PackageX className="w-6 h-6 mr-3 text-red-600" /> {nearMiss ? 'Near-miss Register' : 'Trim Loss Register'}
                    </h1>
                    <p className="text-sm text-gray-500 mt-1 font-medium">
                        {nearMiss ? 'Losses that were found in full during the shift search — logged, no debit.' : 'Escalated losses, debit notes, and salary recovery — newest first.'}
                    </p>
                </div>
                <button onClick={fetchRows} disabled={refreshing} className="p-2.5 bg-white border border-gray-300 rounded-lg shadow-sm hover:bg-gray-50 text-gray-600 disabled:opacity-50 shrink-0" title="Refresh">
                    <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin text-indigo-600' : ''}`} />
                </button>
            </div>

            {/* KPI tiles */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
                <KPICard title="Cases" count={kpis.count} icon={ClipboardList} colorClass="text-indigo-600" bgColorClass="bg-indigo-50" />
                <KPICard title="Loss value" count={fmtMoney(kpis.lossValue)} icon={IndianRupee} colorClass="text-red-600" bgColorClass="bg-red-50" />
                <KPICard title="Outstanding qty" count={kpis.outstanding} icon={PackageX} colorClass="text-amber-600" bgColorClass="bg-amber-50" />
                <KPICard title="Recovered notes" count={kpis.recovered} icon={ShieldCheck} colorClass="text-green-600" bgColorClass="bg-green-50" />
            </div>

            {/* Status tabs (register only) */}
            {!nearMiss && (
                <div className="flex items-center gap-1.5 mb-4 flex-wrap">
                    {TABS.map(t => (
                        <button
                            key={t.key}
                            onClick={() => setTab(t.key)}
                            className={`px-3 py-1.5 rounded-lg text-sm font-bold transition-colors ${tab === t.key ? 'bg-red-600 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>
            )}

            {/* Search */}
            <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                    value={q}
                    onChange={e => setQ(e.target.value)}
                    placeholder="Search by case, item, slip or line…"
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
                    <p className="text-gray-600 font-bold">No cases here</p>
                </div>
            ) : (
                <div className="space-y-2">
                    {filtered.map(r => {
                        const meta = caseStatusOf(r.status);
                        return (
                            <Link
                                key={r.id}
                                to={`/trim-loss/cases/${r.id}`}
                                className="block bg-white rounded-xl border border-gray-200 shadow-sm hover:border-indigo-300 transition-all px-4 py-3"
                            >
                                <div className="flex items-center justify-between gap-4">
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="font-mono font-bold text-gray-800">{r.case_number || `Case #${r.id}`}</span>
                                            <span className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full border ${meta.badge}`}>{meta.label}</span>
                                            {(r.issue_number || r.original_issue_number) && <span className="text-[10px] uppercase tracking-wider font-bold bg-gray-100 text-gray-600 border border-gray-200 px-1.5 py-0.5 rounded">{r.issue_number || r.original_issue_number}</span>}
                                        </div>
                                        <p className="text-sm text-gray-700 mt-1 truncate">{itemLabel(r)}</p>
                                        <p className="text-xs text-gray-400 mt-0.5">
                                            {fmtDateTime(r.created_at)}
                                            {(r.production_line_name || r.line_name) && <> · {r.production_line_name || r.line_name}</>}
                                            {r.note_count != null && <> · {r.note_count} note{r.note_count === 1 ? '' : 's'}</>}
                                        </p>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <p className="font-mono font-bold text-gray-800">{r.loss_value != null ? fmtMoney(r.loss_value) : '—'}</p>
                                        {r.outstanding_qty != null && <p className="text-[11px] text-gray-400">{r.outstanding_qty} outstanding</p>}
                                    </div>
                                </div>
                            </Link>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default TrimLossRegisterPage;

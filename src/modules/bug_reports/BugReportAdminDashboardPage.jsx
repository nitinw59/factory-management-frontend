import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Bug, ChevronLeft, ChevronRight, Loader2, Filter } from 'lucide-react';
import { bugReportApi } from '../../api/bugReportApi';
import { genericApi } from '../../api/genericApi';
import { BugStatusBadge, BugLevelBadge } from '../../shared/BugStatusBadge';

const PAGE_SIZE = 20;
const STATUSES = ['open', 'in_progress', 'resolved', 'closed', 'wont_fix'];
const PRIORITIES = ['low', 'medium', 'high', 'critical'];
const SEVERITIES = ['low', 'medium', 'high', 'critical'];

const BugReportAdminDashboardPage = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const detailPath = (id) => `${location.pathname.replace(/\/$/, '')}/${id}`;

    const [reports, setReports] = useState([]);
    const [users, setUsers] = useState([]);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [filters, setFilters] = useState({ status: '', priority: '', severity: '', assigned_to: '' });

    useEffect(() => {
        genericApi.getAll('shared/factory_users').then((res) => setUsers(res.data ?? [])).catch(() => setUsers([]));
    }, []);

    const load = useCallback(async (p, f) => {
        setLoading(true);
        try {
            const params = { page: p, limit: PAGE_SIZE };
            Object.entries(f).forEach(([k, v]) => { if (v) params[k] = v; });
            const res = await bugReportApi.getAll(params);
            setReports(res.data?.data ?? []);
            setTotalPages(res.data?.total_pages ?? 1);
            setTotal(res.data?.total ?? 0);
        } catch {
            setReports([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(page, filters); }, [page, filters, load]);

    const updateFilter = (key, value) => {
        setPage(1);
        setFilters((prev) => ({ ...prev, [key]: value }));
    };

    return (
        <div className="max-w-6xl mx-auto p-4 md:p-8">
            <div className="flex items-center gap-3 mb-6">
                <div className="p-2.5 bg-rose-100 rounded-xl text-rose-600"><Bug size={22} /></div>
                <div>
                    <h1 className="text-xl font-black text-gray-900">Bug Reports</h1>
                    <p className="text-sm text-gray-400">{total} report{total !== 1 ? 's' : ''} · triage and assign</p>
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 mb-4 bg-white border border-gray-100 rounded-2xl p-3">
                <Filter size={14} className="text-gray-400 ml-1" />
                <select value={filters.status} onChange={(e) => updateFilter('status', e.target.value)}
                    className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-gray-600">
                    <option value="">All statuses</option>
                    {STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
                </select>
                <select value={filters.priority} onChange={(e) => updateFilter('priority', e.target.value)}
                    className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-gray-600">
                    <option value="">All priorities</option>
                    {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
                <select value={filters.severity} onChange={(e) => updateFilter('severity', e.target.value)}
                    className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-gray-600">
                    <option value="">All severities</option>
                    {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <select value={filters.assigned_to} onChange={(e) => updateFilter('assigned_to', e.target.value)}
                    className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-gray-600">
                    <option value="">Anyone assigned</option>
                    {users.map((u) => <option key={u.id} value={u.id}>{u.name || u.email}</option>)}
                </select>
            </div>

            {loading ? (
                <div className="flex justify-center py-20 text-gray-400"><Loader2 className="animate-spin" size={24} /></div>
            ) : reports.length === 0 ? (
                <div className="text-center py-20 text-gray-400 bg-white rounded-2xl border border-gray-100">
                    <Bug size={32} className="mx-auto mb-3 opacity-30" />
                    <p className="font-semibold">No reports match these filters.</p>
                </div>
            ) : (
                <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-100 overflow-hidden">
                    {reports.map((r) => (
                        <button
                            key={r.id}
                            onClick={() => navigate(detailPath(r.id))}
                            className="w-full flex items-center justify-between gap-3 px-5 py-4 hover:bg-gray-50 transition-colors text-left"
                        >
                            <div className="min-w-0">
                                <p className="font-bold text-gray-800 truncate">{r.title}</p>
                                <p className="text-xs text-gray-400 mt-0.5">
                                    {r.reporter_name} · {new Date(r.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                                    {Number(r.attachment_count) > 0 && ` · ${r.attachment_count} attachment${Number(r.attachment_count) !== 1 ? 's' : ''}`}
                                </p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                {r.severity && <BugLevelBadge level={r.severity} />}
                                {r.priority && <BugLevelBadge level={r.priority} />}
                                <BugStatusBadge status={r.status} />
                            </div>
                        </button>
                    ))}
                </div>
            )}

            {totalPages > 1 && (
                <div className="flex items-center justify-center gap-3 mt-6">
                    <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}
                        className="p-2 rounded-lg border border-gray-200 disabled:opacity-30 hover:bg-gray-50">
                        <ChevronLeft size={16} />
                    </button>
                    <span className="text-sm text-gray-500">Page {page} of {totalPages}</span>
                    <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                        className="p-2 rounded-lg border border-gray-200 disabled:opacity-30 hover:bg-gray-50">
                        <ChevronRight size={16} />
                    </button>
                </div>
            )}
        </div>
    );
};

export default BugReportAdminDashboardPage;

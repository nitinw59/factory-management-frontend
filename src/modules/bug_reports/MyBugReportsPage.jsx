import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bug, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { bugReportApi } from '../../api/bugReportApi';
import { BugStatusBadge, BugLevelBadge } from '../../shared/BugStatusBadge';

const PAGE_SIZE = 20;

const MyBugReportsPage = () => {
    const navigate = useNavigate();
    const [reports, setReports] = useState([]);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async (p) => {
        setLoading(true);
        try {
            const res = await bugReportApi.getMine({ page: p, limit: PAGE_SIZE });
            setReports(res.data?.data ?? []);
            setTotalPages(res.data?.total_pages ?? 1);
        } catch {
            setReports([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(page); }, [page, load]);

    return (
        <div className="max-w-4xl mx-auto p-4 md:p-8">
            <div className="flex items-center gap-3 mb-6">
                <div className="p-2.5 bg-rose-100 rounded-xl text-rose-600"><Bug size={22} /></div>
                <div>
                    <h1 className="text-xl font-black text-gray-900">My Bug Reports</h1>
                    <p className="text-sm text-gray-400">Reports you've filed and their current status.</p>
                </div>
            </div>

            {loading ? (
                <div className="flex justify-center py-20 text-gray-400"><Loader2 className="animate-spin" size={24} /></div>
            ) : reports.length === 0 ? (
                <div className="text-center py-20 text-gray-400 bg-white rounded-2xl border border-gray-100">
                    <Bug size={32} className="mx-auto mb-3 opacity-30" />
                    <p className="font-semibold">You haven't filed any bug reports yet.</p>
                </div>
            ) : (
                <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-100 overflow-hidden">
                    {reports.map((r) => (
                        <button
                            key={r.id}
                            onClick={() => navigate(`/bug-reports/${r.id}`)}
                            className="w-full flex items-center justify-between gap-3 px-5 py-4 hover:bg-gray-50 transition-colors text-left"
                        >
                            <div className="min-w-0">
                                <p className="font-bold text-gray-800 truncate">{r.title}</p>
                                <p className="text-xs text-gray-400 mt-0.5">
                                    Filed {new Date(r.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                                </p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                {r.severity && <BugLevelBadge level={r.severity} />}
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

export default MyBugReportsPage;

import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Bug, Loader2, ExternalLink, ImageOff } from 'lucide-react';
import { bugReportApi } from '../../api/bugReportApi';
import { genericApi } from '../../api/genericApi';
import { API_BASE_URL } from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import { BugStatusBadge, BugLevelBadge } from '../../shared/BugStatusBadge';

const ADMIN_ROLES = ['factory_admin', 'production_manager'];
const STATUSES = ['open', 'in_progress', 'resolved', 'closed', 'wont_fix'];
const PRIORITIES = ['low', 'medium', 'high', 'critical'];

const fmt = (iso) => {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
    catch { return iso; }
};

const TriageForm = ({ report, onSaved }) => {
    const [status, setStatus] = useState(report.status ?? 'open');
    const [priority, setPriority] = useState(report.priority ?? '');
    const [assignedTo, setAssignedTo] = useState(report.assigned_to_user_id ?? '');
    const [notes, setNotes] = useState('');
    const [users, setUsers] = useState([]);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        genericApi.getAll('shared/factory_users')
            .then((res) => setUsers(res.data ?? []))
            .catch(() => setUsers([]));
    }, []);

    const handleSave = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            await bugReportApi.triage(report.id, {
                status,
                priority: priority || null,
                assigned_to_user_id: assignedTo || null,
                notes: notes.trim() || undefined,
            });
            setNotes('');
            onSaved();
        } catch (err) {
            alert(err.response?.data?.error || 'Failed to update report.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <form onSubmit={handleSave} className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
            <h3 className="font-bold text-gray-800">Triage</h3>

            <div className="grid grid-cols-2 gap-3">
                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Status</label>
                    <select value={status} onChange={(e) => setStatus(e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                        {STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
                    </select>
                </div>
                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Priority</label>
                    <select value={priority} onChange={(e) => setPriority(e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                        <option value="">— none —</option>
                        {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                </div>
            </div>

            <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Assign to</label>
                <select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                    <option value="">Unassigned</option>
                    {users.map((u) => <option key={u.id} value={u.id}>{u.name || u.email}</option>)}
                </select>
            </div>

            <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Notes (recorded when status changes)</label>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows="2"
                    placeholder="Optional comment…"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none" />
            </div>

            <button type="submit" disabled={saving}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 rounded-xl transition-colors disabled:opacity-50">
                {saving ? 'Saving…' : 'Save Triage'}
            </button>
        </form>
    );
};

const BugReportDetailPage = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();
    const [report, setReport] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await bugReportApi.getById(id);
            setReport(res.data);
        } catch (err) {
            const status = err.response?.status;
            setError(status === 403 ? "You don't have access to this report." : status === 404 ? 'Report not found.' : 'Failed to load report.');
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => { load(); }, [load]);

    const isAdmin = ADMIN_ROLES.includes(user?.role);

    if (loading) {
        return <div className="flex justify-center py-24 text-gray-400"><Loader2 className="animate-spin" size={24} /></div>;
    }

    if (error || !report) {
        return (
            <div className="max-w-2xl mx-auto p-8 text-center">
                <p className="text-gray-500 font-semibold mb-4">{error}</p>
                <button onClick={() => navigate(-1)} className="text-indigo-600 font-bold text-sm hover:underline">Go back</button>
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto p-4 md:p-8">
            <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-sm font-bold text-gray-400 hover:text-gray-600 mb-5">
                <ArrowLeft size={15} /> Back
            </button>

            <div className="bg-white rounded-2xl border border-gray-100 p-6 mb-5">
                <div className="flex items-start justify-between gap-4 mb-3">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-rose-100 rounded-xl text-rose-600 shrink-0"><Bug size={20} /></div>
                        <h1 className="text-lg font-black text-gray-900">{report.title}</h1>
                    </div>
                    <BugStatusBadge status={report.status} />
                </div>

                <p className="text-gray-600 text-sm whitespace-pre-wrap mb-4">{report.description}</p>

                <div className="flex flex-wrap gap-2 mb-4">
                    {report.category && (
                        <span className="text-[10px] font-bold uppercase px-2.5 py-1 rounded-full bg-slate-100 text-slate-600">{report.category.replace(/_/g, ' ')}</span>
                    )}
                    {report.severity && <BugLevelBadge level={report.severity} />}
                    {report.priority && (
                        <span className="text-[10px] font-bold uppercase px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-600 border border-indigo-100">Priority: {report.priority}</span>
                    )}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs text-gray-500 border-t border-gray-100 pt-4">
                    <div><span className="block text-gray-400 uppercase text-[10px] font-bold mb-0.5">Reported by</span>{report.reporter_name || '—'}</div>
                    <div><span className="block text-gray-400 uppercase text-[10px] font-bold mb-0.5">Assigned to</span>{report.assignee_name || 'Unassigned'}</div>
                    <div><span className="block text-gray-400 uppercase text-[10px] font-bold mb-0.5">Filed</span>{fmt(report.created_at)}</div>
                    {report.page_url && (
                        <div className="col-span-2 sm:col-span-3">
                            <span className="block text-gray-400 uppercase text-[10px] font-bold mb-0.5">Page</span>
                            <span className="font-mono break-all">{report.page_url}</span>
                        </div>
                    )}
                </div>
            </div>

            {report.attachments?.length > 0 && (
                <div className="bg-white rounded-2xl border border-gray-100 p-6 mb-5">
                    <h3 className="font-bold text-gray-800 mb-3">Screenshots</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {report.attachments.map((att) => (
                            <a key={att.id} href={`${API_BASE_URL}${att.file_url}`} target="_blank" rel="noreferrer"
                                className="group relative aspect-square bg-gray-50 border border-gray-200 rounded-xl overflow-hidden flex items-center justify-center">
                                <img src={`${API_BASE_URL}${att.file_url}`} alt={att.file_name}
                                    className="w-full h-full object-cover"
                                    onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }} />
                                <div className="hidden absolute inset-0 items-center justify-center text-gray-300"><ImageOff size={20} /></div>
                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                                    <ExternalLink size={16} className="text-white" />
                                </div>
                            </a>
                        ))}
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="bg-white rounded-2xl border border-gray-100 p-6">
                    <h3 className="font-bold text-gray-800 mb-4">History</h3>
                    <div className="space-y-4">
                        {(report.status_history ?? []).map((h, i) => (
                            <div key={h.id ?? i} className="flex gap-3">
                                <div className="flex flex-col items-center">
                                    <div className="w-2.5 h-2.5 rounded-full bg-indigo-500 shrink-0" />
                                    {i < report.status_history.length - 1 && <div className="w-px flex-1 bg-gray-200 mt-1" />}
                                </div>
                                <div className="pb-4 min-w-0">
                                    <p className="text-sm font-semibold text-gray-700">
                                        {h.from_status ? `${h.from_status.replace(/_/g, ' ')} → ` : ''}{h.to_status.replace(/_/g, ' ')}
                                    </p>
                                    <p className="text-xs text-gray-400">{h.changed_by_name || 'System'} · {fmt(h.changed_at)}</p>
                                    {h.notes && <p className="text-xs text-gray-500 mt-1 italic">"{h.notes}"</p>}
                                </div>
                            </div>
                        ))}
                        {(!report.status_history || report.status_history.length === 0) && (
                            <p className="text-sm text-gray-400">No status changes yet.</p>
                        )}
                    </div>
                </div>

                {isAdmin && <TriageForm report={report} onSaved={load} />}
            </div>
        </div>
    );
};

export default BugReportDetailPage;

// Problems & ideas (17 Oct 2026; docs/PROBLEM_REPORTS_V3_PLAN.md): your reports (with new answers marked), the ideas
// list with "me too" votes, and — for the factory admin — every report with filters (status, impact, overdue,
// search) and "mark a release live".
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ThumbsUp, Rocket } from 'lucide-react';
import { problemsApi } from '../api/problemsApi';
import { apiError } from '../api/mastersApi';
import { PageHeader, SearchInput, ErrorBox, Loading, inputCls, SecondaryButton } from '../components/ui';
import { fmtDate } from '../salesOrders/SalesOrderStatusBadge';
import ReportProblemButton from './ReportProblem';

export const STATUS = {
    NEW: ['New', 'bg-indigo-50 text-indigo-800 border-indigo-300'], IN_PROGRESS: ['In progress', 'bg-sky-50 text-sky-800 border-sky-300'],
    NEEDS_INFO: ['Needs info', 'bg-amber-50 text-amber-900 border-amber-300'], FIXED: ['Fixed', 'bg-emerald-50 text-emerald-800 border-emerald-300'],
    CLOSED: ['Closed', 'bg-slate-50 text-slate-500 border-slate-300'], DUPLICATE: ['Duplicate', 'bg-slate-50 text-slate-500 border-slate-300'], WONT_FIX: ["Won't fix", 'bg-slate-50 text-slate-500 border-slate-300'],
};
export const IMPACT = { BLOCKED: ['Blocked', 'text-rose-700'], SLOWED: ['Slowed down', 'text-amber-700'], WRONG: ['Something wrong', 'text-sky-700'] };
export const StatusChip = ({ s, idea }) => <span className={`text-[11px] font-black px-2 py-0.5 rounded border ${STATUS[s]?.[1] || ''}`}>{idea && s === 'IN_PROGRESS' ? 'Planned' : idea && s === 'FIXED' ? 'Done' : idea && s === 'WONT_FIX' ? 'Declined' : STATUS[s]?.[0] || s}</span>;

export default function ProblemsPage() {
    const navigate = useNavigate();
    const [params, setParams] = useSearchParams();
    const [perm, setPerm] = useState({ triage: false });
    const tab = params.get('tab') || 'mine';
    const status = params.get('status') ?? (tab === 'all' ? 'open' : '');
    const impact = params.get('impact') || '';
    const overdue = params.get('overdue') === '1';
    const [q, setQ] = useState('');
    const [rows, setRows] = useState(null);
    const [error, setError] = useState('');
    const set = (k, v) => { const p = new URLSearchParams(params); if (v) p.set(k, v); else p.delete(k); setParams(p, { replace: true }); };
    useEffect(() => { problemsApi.permissions().then(r => setPerm(r.data)).catch(() => {}); }, []);
    const load = useCallback(() => {
        setRows(null);
        problemsApi.list({ scope: tab === 'all' ? 'all' : tab === 'ideas' ? 'ideas' : 'mine', status: status || undefined, impact: impact || undefined, overdue: overdue ? 1 : undefined, q: q.trim() || undefined })
            .then(r => setRows(r.data)).catch(err => setError(apiError(err, 'Failed to load.')));
    }, [tab, status, impact, overdue, q]);
    useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [load]);
    const vote = async (r, e) => { e.stopPropagation(); try { const res = await problemsApi.vote(r.id); setRows(rows.map(x => (x.id === r.id ? { ...x, voted: res.data.voted, votes: res.data.votes } : x))); } catch (err) { setError(apiError(err, 'Failed.')); } };
    const live = async () => {
        const rel = window.prompt('Which release is now live? (the "fixed in" name, e.g. beta 2.6)');
        if (!rel?.trim()) return;
        try { const r = await problemsApi.releaseLive(rel.trim()); window.alert(`${r.data.reports} report(s) fixed in ${r.data.release} are now marked live — their reporters are asked to check.`); load(); } catch (err) { setError(apiError(err, 'Failed.')); }
    };
    const tabs = [['mine', 'Your reports'], ['ideas', 'Ideas'], ...(perm.triage ? [['all', 'All reports (triage)']] : [])];
    const unreadOf = (r) => (tab === 'all' ? r.admin_unread : r.reporter_unread);
    return (
        <div>
            <PageHeader title="Problems & ideas" subtitle="Report a problem from any page with the button at the top. Answers from the factory admin show here and in My work."
                actions={<span className="flex gap-2">{perm.triage && <SecondaryButton onClick={live}><Rocket size={14} /> Release is live</SecondaryButton>}<ReportProblemButton /></span>} />
            <div className="flex flex-wrap items-center gap-2 mb-3">
                <div className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5" role="tablist">
                    {tabs.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setParams({ tab: k }, { replace: true })}
                        className={`px-3 py-1.5 text-sm font-bold rounded-md ${tab === k ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:text-slate-900'}`}>{l}</button>)}
                </div>
                <select className={`${inputCls} !w-40`} value={status} onChange={e => set('status', e.target.value)} aria-label="Status">
                    <option value="">Any status</option><option value="open">Open</option>
                    {Object.entries(STATUS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}
                </select>
                {tab !== 'ideas' && <select className={`${inputCls} !w-44`} value={impact} onChange={e => set('impact', e.target.value)} aria-label="Impact">
                    <option value="">Any impact</option>{Object.entries(IMPACT).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}
                </select>}
                {tab === 'all' && <label className="inline-flex items-center gap-1.5 text-sm text-slate-700"><input type="checkbox" checked={overdue} onChange={e => set('overdue', e.target.checked ? '1' : '')} /> Overdue only</label>}
                <div className="ml-auto"><SearchInput value={q} onChange={setQ} placeholder="Title, text, page, #id" /></div>
            </div>
            <ErrorBox text={error} />
            {!rows ? (!error && <Loading />) : rows.length === 0 ? (
                <p className="bg-white border border-slate-200 rounded-xl px-4 py-8 text-center text-sm text-slate-500">{tab === 'mine' ? 'You have not reported anything yet.' : 'Nothing here.'}</p>
            ) : (
                <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
                    <table className="w-full text-sm min-w-[760px]">
                        <thead className="bg-slate-50 text-xs font-bold text-slate-500 uppercase tracking-wider">
                            <tr className="text-left"><th className="px-3 py-2.5">Report</th><th className="px-3 py-2.5">Page</th>{tab !== 'mine' && <th className="px-3 py-2.5">By</th>}<th className="px-3 py-2.5">Status</th><th className="px-3 py-2.5">Updated</th>{tab === 'ideas' && <th className="px-3 py-2.5 text-right">Votes</th>}</tr>
                        </thead>
                        <tbody>
                            {rows.map(r => (
                                <tr key={r.id} onClick={() => navigate(`/v3/problems/${r.id}`)} className={`border-t border-slate-100 cursor-pointer hover:bg-slate-50 ${unreadOf(r) ? 'bg-indigo-50/40' : ''}`}>
                                    <td className="px-3 py-2.5">
                                        <Link to={`/v3/problems/${r.id}`} onClick={e => e.stopPropagation()} className="font-semibold text-slate-800 hover:text-indigo-700">#{r.id} {r.title}</Link>
                                        <span className="block text-xs">
                                            {r.kind === 'IDEA' ? <span className="text-emerald-700 font-semibold">Idea</span> : <span className={`font-semibold ${IMPACT[r.impact]?.[1]}`}>{IMPACT[r.impact]?.[0]}</span>}
                                            {r.overdue && <span className="ml-2 font-bold text-rose-700">overdue</span>}
                                            {unreadOf(r) && <span className="ml-2 font-bold text-indigo-700">● new</span>}
                                            {r.messages > 0 && <span className="ml-2 text-slate-500">{r.messages} message{r.messages === 1 ? '' : 's'}</span>}
                                            {r.assigned_to_name && <span className="ml-2 text-slate-500">· {r.assigned_to_name}</span>}
                                        </span>
                                    </td>
                                    <td className="px-3 py-2.5 text-xs text-slate-600 max-w-[220px] truncate" title={r.page_path || ''}>{r.page_heading || r.page_path || '—'}</td>
                                    {tab !== 'mine' && <td className="px-3 py-2.5 text-xs text-slate-600">{r.reported_by_name}</td>}
                                    <td className="px-3 py-2.5"><StatusChip s={r.status} idea={r.kind === 'IDEA'} />{r.status === 'FIXED' && r.fixed_in && <span className="block text-[11px] text-slate-500">{r.fixed_in}{r.released_at ? ' · live' : ''}</span>}</td>
                                    <td className="px-3 py-2.5 text-xs text-slate-500 whitespace-nowrap">{fmtDate(r.updated_at)}</td>
                                    {tab === 'ideas' && <td className="px-3 py-2.5 text-right"><button type="button" onClick={(e) => vote(r, e)}
                                        className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-lg border ${r.voted ? 'bg-emerald-50 border-emerald-300 text-emerald-800' : 'border-slate-200 text-slate-600'}`}><ThumbsUp size={12} /> {r.votes}</button></td>}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

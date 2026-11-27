// The AI helpdesk's answer on a problem report (27 Nov 2026, migration 93; owner: "answer goes direct to floor on screen
// who report problem"). Shown in the Report a problem box right after sending, and on the report's page. While it looks
// into the report it says so (the screen polls); then the answer for the reporter, with "Solved / Not solved". The factory
// admin also sees the diagnosis, the lookups it made, the model and the cost.
import { useEffect, useState } from 'react';
import { Bot, Loader2, ThumbsUp, ThumbsDown, ChevronDown, ChevronRight } from 'lucide-react';
import { helpdeskApi } from '../api/helpdeskApi';
import { apiError } from '../api/mastersApi';

const OUTCOME = { EXPLAINED: 'Explained', USER_ACTION: 'User can fix it', NEEDS_SUPERVISOR: 'Needs the supervisor / store', DATA_FIX: 'Data fix needed', BUG: 'Software bug' };
const when = (v) => (v ? new Date(v).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');

// one run: polls while RUNNING; onChange(run) when it changes
export default function HelpdeskAnswer({ run: start, mine = true, admin = false, onChange }) {
    const [run, setRun] = useState(start);
    const [error, setError] = useState('');
    const [open, setOpen] = useState(false);
    useEffect(() => { setRun(start); }, [start]);
    useEffect(() => {
        if (run?.status !== 'RUNNING') return undefined;
        const t = setInterval(async () => {
            try { const r = await helpdeskApi.run(run.id); if (r.data.status !== 'RUNNING') { setRun(r.data); if (onChange) onChange(r.data); } } catch { /* keep trying */ }
        }, 3000);
        return () => clearInterval(t);
    }, [run?.id, run?.status]); // eslint-disable-line react-hooks/exhaustive-deps
    if (!run) return null;
    const rate = async (solved) => { setError(''); try { const r = await helpdeskApi.feedback(run.id, solved); setRun(r.data); if (onChange) onChange(r.data); } catch (err) { setError(apiError(err, 'Failed.')); } };
    const tone = run.status === 'RUNNING' ? 'border-indigo-200 bg-indigo-50/60' : run.status === 'ANSWERED' ? 'border-emerald-300 bg-emerald-50/60' : run.status === 'ESCALATED' ? 'border-amber-300 bg-amber-50/60' : 'border-slate-200 bg-slate-50';
    return (
        <div className={`rounded-xl border px-4 py-3 text-left ${tone}`}>
            <p className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-500"><Bot size={14} /> Helpdesk{run.created_at ? <span className="font-normal normal-case tracking-normal">· {when(run.finished_at || run.created_at)}</span> : null}
                {admin && run.outcome && <span className="ml-auto normal-case tracking-normal font-bold text-slate-700">{OUTCOME[run.outcome]}</span>}</p>
            {run.status === 'RUNNING' ? (
                <p className="mt-2 flex items-center gap-2 text-sm text-indigo-900"><Loader2 size={16} className="animate-spin" /> Looking into it — this takes about a minute…</p>
            ) : (
                <>
                    <p className="mt-1.5 text-base text-slate-900 whitespace-pre-wrap leading-relaxed">{run.answer}</p>
                    {run.status === 'ESCALATED' && <p className="mt-1 text-xs font-bold text-amber-800">Sent to the admin as well.</p>}
                    {mine && ['ANSWERED', 'ESCALATED'].includes(run.status) && (
                        run.feedback ? <p className="mt-2 text-xs font-bold text-slate-600">{run.feedback === 'SOLVED' ? 'You marked it solved — thank you.' : 'You marked it not solved — the admin will look at it.'}</p>
                            : <div className="mt-2 flex flex-wrap items-center gap-2">
                                <span className="text-sm text-slate-600">Did this help?</span>
                                <button type="button" onClick={() => rate(true)} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-emerald-400 bg-white text-sm font-bold text-emerald-800 hover:bg-emerald-50"><ThumbsUp size={14} /> Solved</button>
                                <button type="button" onClick={() => rate(false)} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-sm font-bold text-slate-700 hover:bg-slate-50"><ThumbsDown size={14} /> Not solved</button>
                            </div>
                    )}
                    {!mine && run.feedback && <p className="mt-2 text-xs font-bold text-slate-600">Reporter: {run.feedback === 'SOLVED' ? 'solved' : 'not solved'}</p>}
                    {error && <p className="mt-1 text-xs text-rose-700">{error}</p>}
                </>
            )}
            {admin && run.status !== 'RUNNING' && (
                <div className="mt-2 border-t border-slate-200 pt-2">
                    <button type="button" onClick={() => setOpen(v => !v)} className="inline-flex items-center gap-1 text-xs font-bold text-slate-600 hover:text-indigo-700">{open ? <ChevronDown size={13} /> : <ChevronRight size={13} />} Diagnosis for the admin{run.cost_usd != null ? ` · $${Number(run.cost_usd).toFixed(3)}` : ''}</button>
                    {open && (
                        <div className="mt-1.5 space-y-2 text-xs text-slate-700">
                            {run.diagnosis && <p className="whitespace-pre-wrap text-sm text-slate-800">{run.diagnosis}</p>}
                            {run.error && <p className="text-rose-700">Error: {run.error}</p>}
                            {Array.isArray(run.steps) && run.steps.length > 0 && <ol className="list-decimal pl-5 space-y-0.5">{run.steps.map((s, i) => <li key={i} className="break-all"><b>{s.tool}</b> {s.input || s.outcome || ''}{s.ok === false ? <span className="text-rose-700"> · failed</span> : ''}{s.chars ? <span className="text-slate-400"> · {s.chars} chars</span> : ''}</li>)}</ol>}
                            <p className="text-slate-500">{run.model} · {run.input_tokens} in · {run.cache_read_tokens || 0} cached · {run.output_tokens} out · ${Number(run.cost_usd || 0).toFixed(4)}{run.user_name ? ` · asked by ${run.user_name}` : ''}</p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

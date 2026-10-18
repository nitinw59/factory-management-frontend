// One problem or idea (17 Oct 2026): what was reported with its images, the conversation (factory admin ↔ reporter,
// with images), the reporter's Confirm fix / Reopen, the factory admin's triage (owner, in progress, needs info,
// fixed + release, duplicate, won't fix, close), the captured context (page, roles, build, browser, failed requests,
// browser errors) and the history.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ImagePlus, Send, ThumbsUp, CheckCircle2, RotateCcw } from 'lucide-react';
import Modal from '../../shared/Modal';
import { problemsApi } from '../api/problemsApi';
import { apiError } from '../api/mastersApi';
import { API_BASE_URL } from '../../utils/api';
import { Field, inputCls, PrimaryButton, SecondaryButton, ErrorBox, Loading } from '../components/ui';
import { StatusChip, IMPACT } from './ProblemsPage';
import { FileThumbs, useImages } from './ReportProblem';

const when = (v) => (v ? new Date(v).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
const Images = ({ files }) => (files?.length ? (
    <div className="flex flex-wrap gap-2 mt-2">{files.map(f => (
        <a key={f.id} href={`${API_BASE_URL}${f.file_url}`} target="_blank" rel="noreferrer" title={f.file_name}>
            <img src={`${API_BASE_URL}${f.file_url}`} alt={f.file_name} className="h-24 max-w-[180px] object-cover rounded border border-slate-200 hover:border-indigo-400" />
        </a>
    ))}</div>
) : null);
const ACTION = { REPORTED: 'Reported', ASSIGNED: 'Assigned', STATUS: 'Status', ANSWERED: 'Reporter answered', CONFIRMED: 'Fix confirmed', REOPENED: 'Reopened', RELEASED: 'Release live' };
const TRIAGE = [['IN_PROGRESS', 'In progress'], ['NEEDS_INFO', 'Ask the reporter'], ['FIXED', 'Fixed'], ['DUPLICATE', 'Duplicate'], ['WONT_FIX', "Won't fix"], ['CLOSED', 'Close']];

export default function ProblemPage() {
    const { id } = useParams();
    const [p, setP] = useState(null);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState('');
    const imgs = useImages();
    const fileRef = useRef(null);
    const [admins, setAdmins] = useState([]);
    const [act, setAct] = useState(null);   // { status, note, fix_note, fixed_in, duplicate_of_id } | { reopen, reason }
    const [formError, setFormError] = useState('');
    const load = useCallback(() => problemsApi.get(id).then(r => setP(r.data)).catch(err => setError(apiError(err, 'Failed to load.'))), [id]);
    useEffect(() => { load(); }, [load]);
    useEffect(() => { if (p?.can?.triage && !admins.length) problemsApi.admins().then(r => setAdmins(r.data)).catch(() => {}); }, [p, admins.length]);
    const run = async (fn, after) => { setBusy(true); setError(''); setFormError(''); try { setP((await fn()).data); if (after) after(); } catch (err) { (act ? setFormError : setError)(apiError(err, 'Failed.')); } finally { setBusy(false); } };
    if (!p) return error ? <ErrorBox text={error} /> : <Loading />;
    const idea = p.kind === 'IDEA';
    const send = () => run(() => problemsApi.message(id, msg.trim(), imgs.files), () => { setMsg(''); imgs.setFiles([]); });
    const ctx = p.context || {};
    return (
        <div className="max-w-5xl">
            <Link to="/v3/problems" className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-indigo-600 mb-3"><ArrowLeft size={15} /> Problems & ideas</Link>
            <div className="flex flex-wrap items-center gap-2 mb-1">
                <h1 className="text-xl font-black text-slate-900">#{p.id} {p.title}</h1>
                <StatusChip s={p.status} idea={idea} />
                {idea ? <span className="text-xs font-bold text-emerald-700">Idea</span> : <span className={`text-xs font-bold ${IMPACT[p.impact]?.[1]}`}>{IMPACT[p.impact]?.[0]}</span>}
                {p.overdue && <span className="text-xs font-bold text-rose-700">overdue</span>}
                {p.can.vote && <button type="button" onClick={async () => { const r = await problemsApi.vote(id); setP({ ...p, voted: r.data.voted, votes: r.data.votes }); }}
                    className={`ml-auto inline-flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-lg border ${p.voted ? 'bg-emerald-50 border-emerald-300 text-emerald-800' : 'border-slate-200 text-slate-600'}`}><ThumbsUp size={12} /> Me too · {p.votes}</button>}
            </div>
            <p className="text-sm text-slate-500 mb-3">by {p.reported_by_name} · {when(p.created_at)}{p.assigned_to_name ? ` · owner ${p.assigned_to_name}` : ''}{p.page_heading ? ` · on "${p.page_heading}"` : ''}</p>
            <ErrorBox text={error} />

            {p.status === 'FIXED' && (
                <div className="mb-3 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                    <p className="font-bold">Fixed{p.fixed_in ? ` in ${p.fixed_in}` : ''}{p.released_at ? ' — live now, please check' : ' — not live yet'}</p>
                    {p.fix_note && <p className="mt-0.5">{p.fix_note}</p>}
                    {(p.can.confirm || p.can.reopen) && <div className="mt-2 flex gap-2">
                        {p.can.confirm && <PrimaryButton busy={busy} disabled={busy} onClick={() => run(() => problemsApi.confirm(id))}><CheckCircle2 size={14} /> It works — close</PrimaryButton>}
                        {p.can.reopen && <SecondaryButton onClick={() => setAct({ reopen: true, reason: '' })}><RotateCcw size={14} /> Still wrong — reopen</SecondaryButton>}
                    </div>}
                </div>
            )}
            {p.status === 'CLOSED' && p.can.reopen && <p className="mb-3 text-sm">Closed. <button type="button" className="font-semibold text-indigo-700 underline" onClick={() => setAct({ reopen: true, reason: '' })}>It happened again — reopen</button></p>}
            {p.duplicate_of && <p className="mb-3 text-sm text-slate-600">Same as <Link to={`/v3/problems/${p.duplicate_of.id}`} className="font-semibold text-indigo-700 underline">#{p.duplicate_of.id} {p.duplicate_of.title}</Link> — follow it there.</p>}

            <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
                <div className="space-y-3">
                    <div className="bg-white border border-slate-200 rounded-xl px-4 py-3">
                        <p className="text-sm whitespace-pre-wrap text-slate-800">{p.description}</p>
                        <Images files={p.files} />
                    </div>
                    {p.messages.map(m => (
                        <div key={m.id} className={`rounded-xl px-4 py-3 border ${m.from_admin ? 'bg-indigo-50/60 border-indigo-200 mr-10' : 'bg-white border-slate-200 ml-10'}`}>
                            <p className="text-xs text-slate-500 mb-1"><b className="text-slate-700">{m.user_name}</b>{m.from_admin ? ' · factory admin' : ''} · {when(m.created_at)}</p>
                            <p className="text-sm whitespace-pre-wrap text-slate-800">{m.body}</p>
                            <Images files={m.files} />
                        </div>
                    ))}
                    {p.can.reply && (
                        <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 space-y-2">
                            <textarea className={`${inputCls} min-h-[70px]`} value={msg} onChange={e => setMsg(e.target.value)} placeholder={p.status === 'NEEDS_INFO' && p.mine ? 'Answer the question…' : 'Write a message…'} />
                            <FileThumbs files={imgs.files} onRemove={imgs.remove} />
                            {imgs.err && <p className="text-xs text-rose-700">{imgs.err}</p>}
                            <div className="flex items-center gap-2">
                                <SecondaryButton onClick={() => fileRef.current?.click()}><ImagePlus size={14} /> Image</SecondaryButton>
                                <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={e => { imgs.add(e.target.files); e.target.value = ''; }} />
                                <span className="text-xs text-slate-500">or paste</span>
                                <span className="ml-auto"><PrimaryButton busy={busy} disabled={busy || !msg.trim()} onClick={send}><Send size={14} /> Send</PrimaryButton></span>
                            </div>
                        </div>
                    )}
                </div>

                <aside className="space-y-3">
                    {p.can.triage && (
                        <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 space-y-2">
                            <p className="text-xs font-black uppercase tracking-wider text-slate-500">Triage</p>
                            <Field label="Owner">
                                <select className={inputCls} value={p.assigned_to_user_id || ''} onChange={e => run(() => problemsApi.triage(id, { action: 'assign', user_id: e.target.value || null }))}>
                                    <option value="">— nobody —</option>{admins.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                                </select>
                            </Field>
                            <div className="flex flex-wrap gap-1.5">
                                {TRIAGE.filter(([s]) => s !== p.status).map(([s, l]) => (
                                    <button key={s} type="button" onClick={() => (s === 'IN_PROGRESS' || s === 'CLOSED' ? run(() => problemsApi.triage(id, { action: 'status', status: s })) : setAct({ status: s, note: '', fix_note: '', fixed_in: '', duplicate_of_id: '' }))}
                                        className="text-xs font-bold px-2 py-1 rounded-lg border border-slate-300 hover:border-indigo-400 hover:text-indigo-700">{l}</button>
                                ))}
                            </div>
                        </div>
                    )}
                    {(p.can.triage || p.mine) && (
                        <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 text-xs text-slate-600 space-y-1">
                            <p className="font-black uppercase tracking-wider text-slate-500">Captured with the report</p>
                            {p.page_path && <p>Page: <a href={p.page_path} className="text-indigo-700 underline break-all">{p.page_heading || p.page_path}</a></p>}
                            {p.roles?.length > 0 && <p>Roles: {p.roles.join(', ')}</p>}
                            <p>Build {p.app_build || '—'} · screen {ctx.viewport || '—'} · {ctx.language || ''} {ctx.time_zone || ''}</p>
                            {p.user_agent && <p className="text-[10px] text-slate-400 break-all">{p.user_agent}</p>}
                            {ctx.api_errors?.length > 0 && <div><p className="font-bold text-rose-700 mt-1">Failed requests ({ctx.api_errors.length})</p>
                                {ctx.api_errors.slice().reverse().map((e, i) => <p key={i} className="break-all"><b>{e.status}</b> {e.method} {e.url}{e.message ? ` — ${e.message}` : ''}</p>)}</div>}
                            {ctx.console_errors?.length > 0 && <div><p className="font-bold text-rose-700 mt-1">Browser errors ({ctx.console_errors.length})</p>
                                {ctx.console_errors.slice().reverse().map((e, i) => <p key={i} className="break-all">{e.message} <span className="text-slate-400">{e.source}</span></p>)}</div>}
                            {!ctx.api_errors?.length && !ctx.console_errors?.length && <p className="text-slate-400">No failed requests or browser errors.</p>}
                        </div>
                    )}
                    <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 text-xs text-slate-600 space-y-1">
                        <p className="font-black uppercase tracking-wider text-slate-500">History</p>
                        {p.history.map((h, i) => <p key={i}><b>{ACTION[h.action] || h.action}</b>{h.to_status && h.to_status !== h.from_status ? ` → ${h.to_status.toLowerCase().replace('_', ' ')}` : ''} · {h.user_name || ''} · {when(h.created_at)}</p>)}
                    </div>
                </aside>
            </div>

            {act && (
                <Modal title={act.reopen ? 'Reopen' : TRIAGE.find(([s]) => s === act.status)?.[1]} onClose={() => setAct(null)}>
                    <div className="space-y-3 w-[min(460px,85vw)]">
                        {act.reopen && <Field label="What is still wrong? *"><textarea className={`${inputCls} min-h-[70px]`} value={act.reason} onChange={e => setAct({ ...act, reason: e.target.value })} autoFocus /></Field>}
                        {act.status === 'NEEDS_INFO' && <Field label="Your question to the reporter *"><textarea className={`${inputCls} min-h-[70px]`} value={act.note} onChange={e => setAct({ ...act, note: e.target.value })} autoFocus /></Field>}
                        {act.status === 'WONT_FIX' && <Field label="Why not? (the reporter reads this) *"><textarea className={`${inputCls} min-h-[70px]`} value={act.note} onChange={e => setAct({ ...act, note: e.target.value })} autoFocus /></Field>}
                        {act.status === 'DUPLICATE' && <Field label="Same as report # *"><input className={inputCls} value={act.duplicate_of_id} onChange={e => setAct({ ...act, duplicate_of_id: e.target.value.replace(/\D/g, '') })} autoFocus /></Field>}
                        {act.status === 'FIXED' && <>
                            <Field label="What was fixed? (the reporter reads this) *"><textarea className={`${inputCls} min-h-[70px]`} value={act.fix_note} onChange={e => setAct({ ...act, fix_note: e.target.value })} autoFocus /></Field>
                            <Field label="In release" hint="e.g. beta 2.6 — mark it live from Problems & ideas when it is deployed"><input className={inputCls} value={act.fixed_in} onChange={e => setAct({ ...act, fixed_in: e.target.value })} /></Field>
                        </>}
                        <ErrorBox text={formError} />
                        <div className="flex justify-end gap-2">
                            <SecondaryButton onClick={() => setAct(null)}>Back</SecondaryButton>
                            <PrimaryButton busy={busy} disabled={busy} onClick={() => run(() => (act.reopen ? problemsApi.reopen(id, act.reason) : problemsApi.triage(id, { action: 'status', status: act.status, note: act.note || undefined, fix_note: act.fix_note || undefined, fixed_in: act.fixed_in || undefined, duplicate_of_id: act.duplicate_of_id || undefined })), () => setAct(null))}>Save</PrimaryButton>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
}

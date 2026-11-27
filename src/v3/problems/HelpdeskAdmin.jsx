// The AI helpdesk's settings for the factory admin (27 Nov 2026, migration 93; owner: "lock access to api with password" →
// the admin settings only): the password first (30 minutes), then on / off, the daily limits, what it costs, how often it
// solved the problem, the latest runs with their diagnoses, and changing the password.
import { useEffect, useState } from 'react';
import { Bot, Lock } from 'lucide-react';
import Modal from '../../shared/Modal';
import { helpdeskApi } from '../api/helpdeskApi';
import { apiError } from '../api/mastersApi';
import { Field, inputCls, PrimaryButton, SecondaryButton, ErrorBox } from '../components/ui';
import HelpdeskAnswer from './HelpdeskAnswer';

const usd = (n) => `$${Number(n || 0).toFixed(2)}`;

export default function HelpdeskAdminButton() {
    const [open, setOpen] = useState(false);
    return (
        <>
            <SecondaryButton onClick={() => setOpen(true)}><Bot size={14} /> AI helpdesk</SecondaryButton>
            {open && <HelpdeskAdmin onClose={() => setOpen(false)} />}
        </>
    );
}

function HelpdeskAdmin({ onClose }) {
    const [pw, setPw] = useState('');
    const [data, setData] = useState(null);
    const [form, setForm] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [chg, setChg] = useState(null);   // { current, next, again }
    const [msg, setMsg] = useState('');
    const show = (d) => { setData(d); setForm({ enabled: d.settings.enabled, per: String(d.settings.daily_cap_per_user), total: String(d.settings.daily_cap_total) }); };
    const act = async (fn) => { setBusy(true); setError(''); setMsg(''); try { await fn(); } catch (err) { if (err?.response?.status === 401 && helpdeskApi.unlocked()) { helpdeskApi.lock(); setData(null); } setError(apiError(err, 'Failed.')); } finally { setBusy(false); } };
    const unlock = () => act(async () => { await helpdeskApi.unlock(pw); setPw(''); show((await helpdeskApi.admin()).data); });
    // still unlocked (within the 30 minutes): straight to the settings
    useEffect(() => { if (helpdeskApi.unlocked()) act(async () => show((await helpdeskApi.admin()).data)); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <Modal title="AI helpdesk" onClose={onClose}>
            <div className="w-[min(900px,94vw)] space-y-4">
                {!data ? (
                    <div className="max-w-sm space-y-3">
                        <p className="text-sm text-slate-600"><Lock size={14} className="inline -mt-0.5" /> The helpdesk settings are locked. Enter the helpdesk password (open for 30 minutes).</p>
                        <Field label="Password"><input type="password" className={inputCls} value={pw} onChange={e => setPw(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && pw) unlock(); }} autoFocus /></Field>
                        <ErrorBox text={error} />
                        <PrimaryButton busy={busy} disabled={busy || !pw} onClick={unlock}>Unlock</PrimaryButton>
                    </div>
                ) : (
                    <>
                        {!data.settings.api_key_set && <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"><b>No Anthropic API key on the server.</b> Add ANTHROPIC_API_KEY in Render → Environment (from console.anthropic.com, with a monthly spend limit), then turn the helpdesk on.</p>}
                        <div className="grid sm:grid-cols-4 gap-3">
                            <Stat n={data.usage.runs_today} label="Runs today" sub={usd(data.usage.cost_today)} />
                            <Stat n={data.usage.runs_30d} label="Runs · 30 days" sub={usd(data.usage.cost_30d)} />
                            <Stat n={data.usage.solved_30d} label="Marked solved" sub={`${data.usage.not_solved_30d} not solved · 30 days`} />
                            <Stat n={data.usage.failed_30d} label="Failed" sub={`${data.usage.capped_30d} over the limit · 30 days`} />
                        </div>
                        <div className="rounded-xl border border-slate-200 p-4 space-y-3">
                            <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={form.enabled} onChange={e => setForm({ ...form, enabled: e.target.checked })} /> Helpdesk on — every problem reported goes to it, and its answer shows to the reporter at once</label>
                            <div className="grid sm:grid-cols-3 gap-3">
                                <Field label="Per person per day"><input className={inputCls} type="number" min="0" value={form.per} onChange={e => setForm({ ...form, per: e.target.value })} /></Field>
                                <Field label="Everyone per day"><input className={inputCls} type="number" min="0" value={form.total} onChange={e => setForm({ ...form, total: e.target.value })} /></Field>
                                <Field label="Model"><input className={inputCls} value={data.settings.model} disabled /></Field>
                            </div>
                            <p className="text-xs text-slate-500">Read-only: it looks things up as the person who reported (same access, prices hidden the same way) and never changes data. Above the limits a report goes to you as before.</p>
                            <div className="flex flex-wrap gap-2">
                                <PrimaryButton busy={busy} disabled={busy} onClick={() => act(async () => { show((await helpdeskApi.saveAdmin({ enabled: form.enabled, daily_cap_per_user: Number(form.per), daily_cap_total: Number(form.total) })).data); setMsg('Saved.'); })}>Save</PrimaryButton>
                                <SecondaryButton onClick={() => setChg({ current: '', next: '', again: '' })}>Change password…</SecondaryButton>
                                <SecondaryButton onClick={() => { helpdeskApi.lock(); setData(null); }}><Lock size={14} /> Lock</SecondaryButton>
                                {msg && <span className="self-center text-sm font-bold text-emerald-700">{msg}</span>}
                            </div>
                            {chg && (
                                <div className="grid sm:grid-cols-4 gap-2 items-end">
                                    <Field label="Current"><input type="password" className={inputCls} value={chg.current} onChange={e => setChg({ ...chg, current: e.target.value })} /></Field>
                                    <Field label="New (8+)"><input type="password" className={inputCls} value={chg.next} onChange={e => setChg({ ...chg, next: e.target.value })} /></Field>
                                    <Field label="New again"><input type="password" className={inputCls} value={chg.again} onChange={e => setChg({ ...chg, again: e.target.value })} /></Field>
                                    <PrimaryButton busy={busy} disabled={busy || !chg.current || chg.next.length < 8 || chg.next !== chg.again} onClick={() => act(async () => { await helpdeskApi.password(chg.current, chg.next); setChg(null); setMsg('Password changed.'); })}>Change</PrimaryButton>
                                </div>
                            )}
                            <ErrorBox text={error} />
                        </div>
                        <div>
                            <p className="mb-2 text-xs font-black uppercase tracking-wider text-slate-500">Latest runs</p>
                            {data.runs.length === 0 ? <p className="text-sm text-slate-400">None yet.</p> : (
                                <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">{data.runs.map(r => (
                                    <div key={r.id}>
                                        <p className="text-xs text-slate-500 mb-0.5"><a href={`/v3/problems/${r.report_id}`} className="font-bold text-indigo-700 hover:underline">#{r.report_id} {r.report_title}</a> · {r.user_name} · {r.status.toLowerCase()}</p>
                                        <HelpdeskAnswer run={r} mine={false} admin />
                                    </div>
                                ))}</div>
                            )}
                        </div>
                    </>
                )}
            </div>
        </Modal>
    );
}

const Stat = ({ n, label, sub }) => (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-2.5">
        <span className="block text-2xl font-black tabular-nums text-slate-900">{n}</span>
        <span className="block text-xs font-bold uppercase tracking-wider text-slate-500">{label}</span>
        {sub && <span className="block text-xs text-slate-600">{sub}</span>}
    </div>
);

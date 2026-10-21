// A supervisor's own override password (19 Oct 2026, phase 4): the password a checker's screen asks for to pass the
// rework limit or undo a check. It is 2.0's override password (one per supervisor, valid in both versions; 3.0 sets it
// under the shared-master exception, logged — never the password). Lists the overrides this supervisor authorised.
// 20 Oct 2026 (line accountability): the lines they are responsible for, and every override on them — theirs and
// those of others covering.
import { useCallback, useEffect, useState } from 'react';
import { KeyRound } from 'lucide-react';
import { productionApi } from '../api/productionApi';
import { apiError } from '../api/mastersApi';
import { Field, inputCls, PrimaryButton, ErrorBox } from '../components/ui';

const KIND = { REWORK_BLOCK: 'Rework limit passed', REVERT: 'Check undone' };

export default function SupervisorPinCard({ showOverrides = true }) {
    const [d, setD] = useState(null);
    const [pin, setPin] = useState('');
    const [again, setAgain] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [msg, setMsg] = useState('');
    const load = useCallback(() => productionApi.supervisorPin().then(r => setD(r.data)).catch(err => setError(apiError(err, 'Failed to load.'))), []);
    useEffect(() => { load(); }, [load]);
    const save = async () => {
        setBusy(true); setError(''); setMsg('');
        try { const r = await productionApi.setSupervisorPin(pin); setMsg(r.data.message); setPin(''); setAgain(''); load(); }
        catch (err) { setError(apiError(err, 'Failed to save.')); } finally { setBusy(false); }
    };
    const ok = pin.length >= 4 && pin.length <= 32 && pin === again;
    return (
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2"><KeyRound size={18} className="text-indigo-600" /><h2 className="font-black text-slate-800">My override password</h2>
                <span className={`ml-auto text-xs font-bold px-2 py-0.5 rounded ${d?.has_pin ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>{d ? (d.has_pin ? `Set · changed ${new Date(d.updated_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}` : 'Not set') : ''}</span></div>
            <p className="text-xs text-slate-500">A checker's screen asks for a supervisor's password to pass the rework limit or undo a check. It is the same password in 2.0 and 3.0. 4–32 characters, different from every other supervisor's; never shown again.</p>
            <div className="grid sm:grid-cols-3 gap-3 items-end">
                <Field label={d?.has_pin ? 'New password' : 'Password'}><input className={inputCls} type="password" autoComplete="new-password" value={pin} onChange={e => setPin(e.target.value)} maxLength={32} /></Field>
                <Field label="Again"><input className={inputCls} type="password" autoComplete="new-password" value={again} onChange={e => setAgain(e.target.value)} maxLength={32} /></Field>
                <PrimaryButton onClick={save} busy={busy} disabled={busy || !ok}>{d?.has_pin ? 'Change password' : 'Set password'}</PrimaryButton>
            </div>
            {pin && again && pin !== again && <p className="text-xs font-semibold text-rose-700">The two don't match.</p>}
            <ErrorBox text={error} />
            {msg && <p className="text-sm font-semibold text-emerald-700">{msg}</p>}
            {showOverrides && d && (
                <div>
                    <p className="text-xs font-black uppercase tracking-wider text-slate-500 mb-1">On my lines {d.my_lines?.length ? <span className="normal-case font-semibold text-slate-600">— {d.my_lines.map(l => l.name).join(', ')}</span> : null}</p>
                    {!d.my_lines?.length ? <p className="text-sm text-slate-400">You are not the responsible supervisor of any line.</p>
                        : !d.on_my_lines?.length ? <p className="text-sm text-slate-400">No overrides on your lines.</p> : (
                            <div className="divide-y divide-slate-100 text-sm max-h-60 overflow-y-auto">{d.on_my_lines.map(o => (
                                <p key={o.id} className="py-1.5"><span className="text-xs text-slate-400 mr-2">{new Date(o.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                                    <b>{KIND[o.kind] || o.kind}</b>{o.floor_no ? ` · #${o.floor_no}` : ''}{o.stage ? ` · ${o.stage}` : ''}{o.line ? ` · ${o.line}` : ''}
                                    {o.covering ? <span className="ml-1 text-[11px] font-black px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-300">by {o.authorised_by || 'someone'} — covering</span> : <span className="text-slate-500"> · by you</span>}
                                    {o.checker ? <span className="text-slate-500"> · for {o.checker}</span> : null}{o.reason ? <span className="text-slate-500"> — {o.reason}</span> : null}</p>
                            ))}</div>
                        )}
                </div>
            )}
            {showOverrides && d?.overrides?.length > 0 && (
                <div>
                    <p className="text-xs font-black uppercase tracking-wider text-slate-500 mb-1">Overrides I authorised</p>
                    <div className="divide-y divide-slate-100 text-sm max-h-60 overflow-y-auto">{d.overrides.map(o => (
                        <p key={o.id} className="py-1.5"><span className="text-xs text-slate-400 mr-2">{new Date(o.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                            <b>{KIND[o.kind] || o.kind}</b>{o.floor_no ? ` · #${o.floor_no}` : ''}{o.stage ? ` · ${o.stage}` : ''}{o.line ? ` · ${o.line}` : ''}{o.checker ? <span className="text-slate-500"> · for {o.checker}</span> : null}{o.reason ? <span className="text-slate-500"> — {o.reason}</span> : null}</p>
                    ))}</div>
                </div>
            )}
        </div>
    );
}

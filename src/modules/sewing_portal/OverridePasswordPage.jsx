import React, { useEffect, useState } from 'react';
import { LuKeyRound, LuCircleCheck, LuTriangleAlert, LuLoader } from 'react-icons/lu';
import { supervisorPinApi } from '../../api/supervisorPinApi';

// Line supervisor sets their own override password. Checkers need it (typed
// by the supervisor) to unlock a rejected piece or revert an approval on the
// universal / garment portals; each override is recorded under the supervisor
// whose password was used.
const MIN = 4;

const OverridePasswordPage = () => {
    const [status, setStatus] = useState(null); // { has_pin, updated_at }
    const [pin, setPin] = useState('');
    const [confirm, setConfirm] = useState('');
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState(null); // { type: 'ok' | 'error', text }

    const load = () => supervisorPinApi.getStatus()
        .then(res => setStatus(res.data))
        .catch(() => setStatus({ has_pin: false, error: true }));
    useEffect(() => { load(); }, []);

    const mismatch = confirm.length > 0 && pin !== confirm;
    const tooShort = pin.length > 0 && pin.trim().length < MIN;
    const canSave = pin.trim().length >= MIN && pin === confirm && !saving;

    const handleSave = async (e) => {
        e.preventDefault();
        if (!canSave) return;
        setSaving(true);
        setMessage(null);
        try {
            await supervisorPinApi.setPin(pin.trim());
            setMessage({ type: 'ok', text: 'Override password saved.' });
            setPin(''); setConfirm('');
            load();
        } catch (err) {
            setMessage({ type: 'error', text: err.response?.data?.error || 'Could not save the password.' });
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="max-w-lg mx-auto p-4 sm:p-6">
            <div className="flex items-center gap-3 mb-2">
                <div className="w-11 h-11 rounded-xl bg-indigo-100 flex items-center justify-center">
                    <LuKeyRound className="text-indigo-600" size={22} />
                </div>
                <div>
                    <h1 className="text-xl font-black text-slate-900">Override Password</h1>
                    <p className="text-xs text-slate-500">Your personal supervisor password for QC overrides</p>
                </div>
            </div>

            <div className="mt-4 p-4 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-600 space-y-1.5">
                <p>Checkers need this password to <span className="font-bold text-slate-800">unlock a rejected piece</span> or <span className="font-bold text-slate-800">revert an approved piece</span>.</p>
                <p>Type it yourself on the checker's tablet — every override is recorded under your name. Don't share it.</p>
            </div>

            <div className="mt-4 text-sm">
                {status === null ? (
                    <span className="flex items-center gap-2 text-slate-400"><LuLoader className="animate-spin" size={14} /> Loading…</span>
                ) : status.has_pin ? (
                    <span className="flex items-center gap-2 font-bold text-emerald-700">
                        <LuCircleCheck size={16} /> Password set{status.updated_at ? ` · last changed ${new Date(status.updated_at).toLocaleString()}` : ''}
                    </span>
                ) : (
                    <span className="flex items-center gap-2 font-bold text-amber-700">
                        <LuTriangleAlert size={16} /> Not set yet — checkers can't use your approval until you set one.
                    </span>
                )}
            </div>

            <form onSubmit={handleSave} className="mt-5 space-y-3">
                <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                        {status?.has_pin ? 'New password' : 'Password'}
                    </label>
                    <input type="password" autoComplete="new-password" value={pin} onChange={e => setPin(e.target.value)}
                        className="w-full p-3 border-2 border-slate-300 rounded-xl font-mono text-lg tracking-widest focus:border-indigo-500 outline-none" />
                    {tooShort && <p className="mt-1 text-xs font-bold text-rose-600">At least {MIN} characters.</p>}
                </div>
                <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Confirm password</label>
                    <input type="password" autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)}
                        className="w-full p-3 border-2 border-slate-300 rounded-xl font-mono text-lg tracking-widest focus:border-indigo-500 outline-none" />
                    {mismatch && <p className="mt-1 text-xs font-bold text-rose-600">Passwords don't match.</p>}
                </div>

                {message && (
                    <p className={`text-sm font-bold ${message.type === 'ok' ? 'text-emerald-700' : 'text-rose-600'}`}>{message.text}</p>
                )}

                <button type="submit" disabled={!canSave}
                    className="w-full py-3 rounded-xl bg-slate-900 text-white font-black uppercase tracking-widest text-sm disabled:opacity-40 flex items-center justify-center gap-2">
                    {saving && <LuLoader className="animate-spin" size={14} />}
                    {status?.has_pin ? 'Change password' : 'Set password'}
                </button>
            </form>
        </div>
    );
};

export default OverridePasswordPage;

// --- File: src/shared/SupervisorPinPrompt.jsx ---
// Masked supervisor-password dialog for QC overrides (unlock a rejected piece,
// revert an approval). The password is verified on the SERVER, which also
// records which supervisor authorised the override — nothing is checked or
// stored in the browser. window.prompt was used before, but it shows the
// password in plain text on a shared tablet.
//
// Usage:
//   const [pinDialog, askSupervisorPin] = useSupervisorPinPrompt();
//   const pin = await askSupervisorPin('Unlock rejected piece #28');  // null if cancelled
//   ...render {pinDialog} somewhere in the component.
import React, { useCallback, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ShieldAlert } from 'lucide-react';

export const useSupervisorPinPrompt = () => {
    const [request, setRequest] = useState(null); // { message, error }
    const resolverRef = useRef(null);
    const [value, setValue] = useState('');

    const ask = useCallback((message, error = '') => new Promise(resolve => {
        resolverRef.current = resolve;
        setValue('');
        setRequest({ message, error });
    }), []);

    const finish = (result) => {
        const resolve = resolverRef.current;
        resolverRef.current = null;
        setRequest(null);
        setValue('');
        if (resolve) resolve(result);
    };

    const dialog = request ? createPortal(
        <div className="fixed inset-0 z-[1000] bg-black/70 flex items-center justify-center p-4" onClick={() => finish(null)}>
            <form
                className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6"
                onClick={e => e.stopPropagation()}
                onSubmit={e => { e.preventDefault(); if (value.trim()) finish(value.trim()); }}
            >
                <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                        <ShieldAlert className="w-5 h-5 text-amber-600" />
                    </div>
                    <div>
                        <h3 className="font-black text-slate-900">Supervisor password</h3>
                        <p className="text-xs text-slate-500 font-medium">{request.message}</p>
                    </div>
                </div>
                <input
                    type="password"
                    autoFocus
                    autoComplete="off"
                    value={value}
                    onChange={e => setValue(e.target.value)}
                    className="w-full p-3 border-2 border-slate-300 rounded-xl font-mono text-lg tracking-widest focus:border-indigo-500 outline-none"
                    placeholder="••••"
                />
                {request.error && <p className="mt-2 text-xs font-bold text-rose-600">{request.error}</p>}
                <p className="mt-2 text-[11px] text-slate-400">The supervisor types their own password. The override is recorded under their name.</p>
                <div className="flex justify-end gap-2 mt-4">
                    <button type="button" onClick={() => finish(null)} className="px-4 py-2 rounded-xl border-2 border-slate-200 font-bold text-sm text-slate-700">Cancel</button>
                    <button type="submit" disabled={!value.trim()} className="px-5 py-2 rounded-xl bg-slate-900 text-white font-black text-sm disabled:opacity-40">Authorise</button>
                </div>
            </form>
        </div>,
        document.body
    ) : null;

    return [dialog, ask];
};

// Retry an API call with a supervisor password when the server asks for one
// (403 SUPERVISOR_PIN_REQUIRED / SUPERVISOR_PIN_INVALID). `send(pin)` performs
// the request. Resolves with the response, or null if the user cancels.
// initialPin: omit to ask first; pass '' to try WITHOUT a password and only
// ask if the server requires one.
export const withSupervisorPin = async (ask, message, send, initialPin = undefined) => {
    let pin = initialPin;
    let error = '';
    for (;;) {
        if (pin === undefined || pin === null) {
            pin = await ask(message, error);
            if (pin === null) return null;
        }
        try {
            return await send(pin);
        } catch (err) {
            const code = err.response?.data?.code;
            if (code === 'SUPERVISOR_PIN_INVALID' || code === 'SUPERVISOR_PIN_REQUIRED') {
                error = err.response.data.error;
                pin = undefined;
                continue;
            }
            throw err;
        }
    }
};

// Shared bits for garment label printing: status chips, printer / agent status,
// the reason dialog (reprint, single label, cancel, void) and small helpers.
import React, { useEffect, useRef, useState } from 'react';
import { FiX, FiLoader } from 'react-icons/fi';

export const JOB_TYPE_LABELS = { ROLL: 'Roll', ROLL_REPRINT: 'Roll reprint', SINGLE: 'Single label' };

const STATUS_STYLES = {
    QUEUED: 'bg-slate-100 text-slate-700 border-slate-200',
    PRINTING: 'bg-blue-50 text-blue-700 border-blue-200',
    PRINTED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    FAILED: 'bg-red-50 text-red-700 border-red-200',
    CANCELLED: 'bg-gray-50 text-gray-500 border-gray-200',
};
const STATUS_TEXT = { QUEUED: 'Waiting', PRINTING: 'Printing', PRINTED: 'Printed', FAILED: 'Failed', CANCELLED: 'Cancelled' };

export const JobStatusChip = ({ status }) => (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-bold uppercase tracking-wide ${STATUS_STYLES[status] || STATUS_STYLES.QUEUED}`}>
        {status === 'PRINTING' && <FiLoader className="animate-spin" size={11} />}
        {STATUS_TEXT[status] || status}
    </span>
);

export const formatWhen = (ts) => {
    if (!ts) return '';
    const d = new Date(ts);
    const today = new Date();
    const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return d.toDateString() === today.toDateString() ? time : `${d.toLocaleDateString([], { day: '2-digit', month: 'short' })} ${time}`;
};

export const apiError = (err, fallback) => err?.response?.data?.error || err?.response?.data?.message || fallback;

// Online = the agent on the BarTender PC sent a heartbeat in the last 90s and BarTender answered it.
export const PrinterStatus = ({ printer }) => {
    if (!printer) return null;
    const ok = printer.agent_online && printer.bartender_ok !== false;
    const text = !printer.agent_online
        ? 'Print agent offline — jobs wait in the queue'
        : printer.bartender_ok === false ? (printer.bartender_message || 'BarTender not answering') : 'Ready';
    return (
        <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${ok ? 'text-emerald-700' : 'text-amber-700'}`} title={printer.bartender_message || ''}>
            <span className={`w-2 h-2 rounded-full ${ok ? 'bg-emerald-500' : 'bg-amber-500'}`} />
            {text}
        </span>
    );
};

export const PrinterSelect = ({ printers, value, onChange, className = '' }) => (
    <select
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        className={`border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300 ${className}`}
    >
        {printers.length === 0 && <option value="">No printer set up</option>}
        {printers.map(p => (
            <option key={p.id} value={p.id}>{p.name}{p.location ? ` · ${p.location}` : ''}{p.is_default ? ' (default)' : ''}</option>
        ))}
    </select>
);

// Asks for a reason before a reprint / single label / cancel / void.
export const ReasonModal = ({ isOpen, title, description, quickReasons = [], confirmLabel, confirmClass = 'bg-indigo-600 hover:bg-indigo-700', onConfirm, onClose, children }) => {
    const [reason, setReason] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const inputRef = useRef(null);

    useEffect(() => {
        if (isOpen) { setReason(''); setError(null); setBusy(false); setTimeout(() => inputRef.current?.focus(), 50); }
    }, [isOpen]);

    if (!isOpen) return null;

    const submit = async () => {
        if (reason.trim().length < 3) { setError('Please give a reason.'); return; }
        setBusy(true); setError(null);
        try {
            await onConfirm(reason.trim());
        } catch (err) {
            setError(apiError(err, 'Something went wrong.'));
            setBusy(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onMouseDown={e => { if (e.target === e.currentTarget && !busy) onClose(); }}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md border border-gray-200">
                <div className="flex items-center justify-between p-5 border-b border-gray-100">
                    <h2 className="text-base font-bold text-gray-900">{title}</h2>
                    <button onClick={onClose} disabled={busy} className="p-1.5 rounded-lg hover:bg-gray-100"><FiX className="h-4 w-4 text-gray-500" /></button>
                </div>
                <div className="p-5 space-y-3">
                    {description && <p className="text-sm text-gray-600">{description}</p>}
                    {children}
                    {quickReasons.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                            {quickReasons.map(q => (
                                <button key={q} type="button" onClick={() => setReason(q)}
                                    className={`px-2.5 py-1 rounded-full text-xs border ${reason === q ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                                    {q}
                                </button>
                            ))}
                        </div>
                    )}
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Reason</label>
                        <input ref={inputRef} value={reason} onChange={e => setReason(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') submit(); }}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" placeholder="Why?" />
                    </div>
                    {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-100">{error}</p>}
                </div>
                <div className="flex gap-3 px-5 pb-5">
                    <button onClick={onClose} disabled={busy} className="flex-1 px-4 py-2.5 text-sm font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg">Back</button>
                    <button onClick={submit} disabled={busy} className={`flex-1 px-4 py-2.5 text-sm font-bold text-white rounded-lg flex items-center justify-center gap-2 disabled:opacity-50 ${confirmClass}`}>
                        {busy && <FiLoader className="animate-spin h-4 w-4" />} {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
};

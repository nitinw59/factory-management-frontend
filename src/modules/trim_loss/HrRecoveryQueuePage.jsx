import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { trimLossApi } from '../../api/trimLossApi';
import { fmtDateTime, fmtMoney } from './format';
import {
    Loader2, RefreshCw, AlertCircle, Inbox, CheckCircle2, X, Wallet, ChevronRight,
} from 'lucide-react';

// Confirm-recovery modal for a single approved debit note.
const ConfirmRecoveryModal = ({ note, onClose, onDone }) => {
    const [notes, setNotes] = useState(`Deducted from salary`);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState(null);

    const submit = async () => {
        setSubmitting(true);
        setError(null);
        try {
            const res = await trimLossApi.confirmRecovery(note.id, { recovery_notes: notes.trim() });
            console.log('[trimloss] confirmRecovery raw:', res.data);
            onDone(res.data || {});
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to confirm recovery.');
            setSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center p-4 z-[500]" onMouseDown={onClose}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6" onMouseDown={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-extrabold text-gray-900">Confirm recovery — {note.debit_note_number || `DN-${note.id}`}</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
                </div>
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm mb-4">
                    <p><span className="font-semibold text-gray-800">{note.employee_name}</span> · {note.item_name}</p>
                    <p className="text-gray-500 mt-0.5">{note.qty} pcs × {fmtMoney(note.unit_cost)} = <span className="font-mono font-bold text-gray-800">{fmtMoney(note.amount)}</span></p>
                </div>
                <label className="text-[10px] uppercase tracking-wider font-bold text-gray-400">Recovery notes</label>
                <textarea
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    rows={3}
                    placeholder="e.g. Deducted from July 2026 salary"
                    className="mt-1 w-full border border-gray-300 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                />
                {error && (
                    <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 font-medium flex items-start">
                        <AlertCircle className="w-4 h-4 mr-2 shrink-0 mt-0.5" /> {error}
                    </div>
                )}
                <div className="flex gap-2 mt-5">
                    <button onClick={onClose} disabled={submitting} className="flex-1 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg font-bold text-sm hover:bg-gray-200 disabled:opacity-50">Cancel</button>
                    <button onClick={submit} disabled={submitting} className="flex-1 px-4 py-2.5 bg-green-600 text-white rounded-lg font-bold text-sm hover:bg-green-700 disabled:opacity-50 flex items-center justify-center">
                        {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                        Confirm recovery
                    </button>
                </div>
            </div>
        </div>
    );
};

const HrRecoveryQueuePage = () => {
    const [rows, setRows] = useState(null);
    const [error, setError] = useState(null);
    const [refreshing, setRefreshing] = useState(false);
    const [active, setActive] = useState(null); // note being confirmed
    const [toast, setToast] = useState(null); // { kind, text }

    const fetchRows = useCallback(async () => {
        setRefreshing(true);
        setError(null);
        try {
            const res = await trimLossApi.getDebitNotes({ status: 'APPROVED' });
            console.log('[trimloss] getDebitNotes raw:', res.data);
            setRows(Array.isArray(res.data) ? res.data : (res.data?.data || []));
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to load recovery queue.');
            setRows([]);
        } finally {
            setRefreshing(false);
        }
    }, []);

    useEffect(() => { fetchRows(); }, [fetchRows]);

    const handleDone = (result) => {
        const closed = result.case_status === 'CLOSED';
        setToast({
            kind: 'success',
            text: closed
                ? `Recovery confirmed — that was the last note, so the case is now CLOSED.`
                : `Recovery confirmed.`,
        });
        setActive(null);
        fetchRows();
    };

    return (
        <div className="max-w-4xl mx-auto">
            <div className="flex items-center justify-between mb-5 gap-4">
                <div className="min-w-0">
                    <h1 className="text-2xl font-extrabold text-gray-900 flex items-center">
                        <Wallet className="w-6 h-6 mr-3 text-indigo-600" /> Salary Recovery Queue
                    </h1>
                    <p className="text-sm text-gray-500 mt-1 font-medium">Approved debit notes awaiting recovery from salary. Confirm each once deducted.</p>
                </div>
                <button onClick={fetchRows} disabled={refreshing} className="p-2.5 bg-white border border-gray-300 rounded-lg shadow-sm hover:bg-gray-50 text-gray-600 disabled:opacity-50 shrink-0" title="Refresh">
                    <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin text-indigo-600' : ''}`} />
                </button>
            </div>

            {toast && (
                <div className={`mb-4 p-3 rounded-lg text-sm font-medium flex items-start ${toast.kind === 'error' ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200'}`}>
                    <CheckCircle2 className="w-4 h-4 mr-2 shrink-0 mt-0.5" />
                    <span className="flex-1">{toast.text}</span>
                    <button onClick={() => setToast(null)} className="ml-2 opacity-60 hover:opacity-100"><X className="w-3.5 h-3.5" /></button>
                </div>
            )}

            {error && (
                <div className="p-4 mb-4 bg-red-50 text-red-700 rounded-xl border border-red-200 flex items-center text-sm font-medium">
                    <AlertCircle className="h-5 w-5 mr-3 shrink-0" /> {error}
                </div>
            )}

            {rows === null ? (
                <div className="flex justify-center p-16"><Loader2 className="animate-spin h-10 w-10 text-indigo-600" /></div>
            ) : rows.length === 0 ? (
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-16 text-center">
                    <Inbox className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-600 font-bold">No pending recoveries</p>
                    <p className="text-sm text-gray-400 mt-1">Approved debit notes will appear here for salary recovery.</p>
                </div>
            ) : (
                <div className="space-y-2">
                    {rows.map(n => (
                        <div key={n.id} className="flex items-center justify-between gap-4 bg-white rounded-xl border border-gray-200 shadow-sm px-4 py-3">
                            <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-mono font-bold text-gray-800">{n.debit_note_number || `DN-${n.id}`}</span>
                                    <span className="font-semibold text-gray-700">{n.employee_name}</span>
                                    {n.case_number && <Link to={`/trim-loss/cases/${n.case_id}`} className="text-[10px] uppercase tracking-wider font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 px-1.5 py-0.5 rounded hover:bg-indigo-100 inline-flex items-center gap-0.5">{n.case_number} <ChevronRight className="w-3 h-3" /></Link>}
                                </div>
                                <p className="text-xs text-gray-500 mt-1">
                                    {n.item_name}{n.qty != null && <> · {n.qty} pcs × {fmtMoney(n.unit_cost)}</>}
                                    {n.approved_at && <> · approved {fmtDateTime(n.approved_at)}</>}
                                </p>
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                                <span className="font-mono font-bold text-gray-800">{fmtMoney(n.amount)}</span>
                                <button
                                    onClick={() => setActive(n)}
                                    className="flex items-center px-3 py-2 bg-green-600 text-white rounded-lg text-sm font-bold hover:bg-green-700"
                                >
                                    <CheckCircle2 className="w-4 h-4 mr-1.5" /> Recover
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {active && <ConfirmRecoveryModal note={active} onClose={() => setActive(null)} onDone={handleDone} />}
        </div>
    );
};

export default HrRecoveryQueuePage;

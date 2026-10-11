// Print one garment label from a typed garment number — for a label lost or
// damaged on the floor. Shows the garment and its print history first, needs a
// reason, then follows the job until the printer confirms.
import React, { useEffect, useRef, useState } from 'react';
import { FiX, FiSearch, FiPrinter, FiLoader, FiCheckCircle, FiAlertTriangle } from 'react-icons/fi';
import { labelPrintingApi } from '../../api/labelPrintingApi';
import { JobStatusChip, JOB_TYPE_LABELS, PrinterSelect, PrinterStatus, apiError, formatWhen } from './labelShared';

const QUICK_REASONS = ['Label lost on the floor', 'Label damaged', 'Label not readable', 'Label fell off'];

const SingleLabelPrintModal = ({ isOpen, onClose, initialUid = '', onPrinted }) => {
    const [uid, setUid] = useState('');
    const [garment, setGarment] = useState(null);
    const [lookupError, setLookupError] = useState(null);
    const [looking, setLooking] = useState(false);
    const [printers, setPrinters] = useState([]);
    const [printerId, setPrinterId] = useState('');
    const [reason, setReason] = useState('');
    const [job, setJob] = useState(null);
    const [submitError, setSubmitError] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    const inputRef = useRef(null);

    useEffect(() => {
        if (!isOpen) return;
        setUid(initialUid); setGarment(null); setLookupError(null); setReason(''); setJob(null); setSubmitError(null);
        labelPrintingApi.getPrinters().then(r => {
            setPrinters(r.data);
            const def = r.data.find(p => p.is_default) || r.data[0];
            setPrinterId(def ? String(def.id) : '');
        }).catch(() => setPrinters([]));
        setTimeout(() => inputRef.current?.focus(), 50);
        if (initialUid) lookup(initialUid);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen]);

    // Follow the job until the agent reports back.
    useEffect(() => {
        if (!job || !['QUEUED', 'PRINTING'].includes(job.status)) return undefined;
        const t = setInterval(async () => {
            try {
                const r = await labelPrintingApi.getJob(job.id);
                setJob(r.data);
                if (r.data.status === 'PRINTED' && onPrinted) onPrinted(r.data);
            } catch { /* keep polling */ }
        }, 2000);
        return () => clearInterval(t);
    }, [job, onPrinted]);

    const lookup = async (value) => {
        const v = String(value ?? uid).trim();
        if (!v) return;
        setLooking(true); setLookupError(null); setGarment(null); setJob(null);
        try {
            const r = await labelPrintingApi.lookupGarment(v);
            setGarment(r.data);
        } catch (err) {
            setLookupError(apiError(err, 'Could not look up that garment.'));
        } finally { setLooking(false); }
    };

    const print = async () => {
        if (reason.trim().length < 3) { setSubmitError('Please give a reason.'); return; }
        setSubmitting(true); setSubmitError(null);
        try {
            const r = await labelPrintingApi.printSingle({ garmentUid: garment.garment_uid, printerId, reason: reason.trim() });
            setJob(r.data);
        } catch (err) {
            setSubmitError(apiError(err, 'Could not queue the label.'));
        } finally { setSubmitting(false); }
    };

    if (!isOpen) return null;
    const printer = printers.find(p => String(p.id) === String(printerId));
    const done = job && !['QUEUED', 'PRINTING'].includes(job.status);

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg border border-gray-200 max-h-[92vh] overflow-y-auto">
                <div className="flex items-center justify-between p-5 border-b border-gray-100">
                    <div className="flex items-center gap-2">
                        <FiPrinter className="h-5 w-5 text-indigo-600" />
                        <h2 className="text-base font-bold text-gray-900">Print a single garment label</h2>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100"><FiX className="h-4 w-4 text-gray-500" /></button>
                </div>

                <div className="p-5 space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Garment number</label>
                        <div className="flex gap-2">
                            <input ref={inputRef} value={uid} onChange={e => setUid(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') lookup(); }}
                                placeholder="e.g. 224-2890-38-035" disabled={!!job && !done}
                                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                            <button onClick={() => lookup()} disabled={looking || !uid.trim()}
                                className="px-3 py-2 bg-slate-800 text-white rounded-lg text-sm font-bold flex items-center gap-1.5 disabled:opacity-50">
                                {looking ? <FiLoader className="animate-spin" /> : <FiSearch />} Find
                            </button>
                        </div>
                        {lookupError && <p className="mt-2 text-sm text-red-600">{lookupError}</p>}
                    </div>

                    {garment && (
                        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm space-y-2">
                            <div className="flex justify-between items-start gap-3">
                                <div>
                                    <div className="font-mono font-bold text-gray-900">{garment.garment_uid}</div>
                                    <div className="text-gray-600">{garment.product_name} · Batch {garment.batch_code || `#${garment.production_batch_id}`} · Roll {garment.fabric_roll_id}</div>
                                    <div className="text-gray-600">Size <b>{garment.size}</b> · No. <b>{garment.piece_sequence}</b></div>
                                </div>
                                {garment.barcode_printed
                                    ? <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5 whitespace-nowrap">Label printed {formatWhen(garment.barcode_printed_at)}</span>
                                    : <span className="text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5 whitespace-nowrap">No label yet</span>}
                            </div>
                            {garment.history.length > 0 && (
                                <div className="border-t border-gray-200 pt-2">
                                    <div className="text-[11px] font-bold text-gray-500 uppercase mb-1">Print history</div>
                                    {garment.history.slice(0, 5).map(h => (
                                        <div key={h.job_id} className="flex items-center gap-2 text-xs text-gray-600 py-0.5">
                                            <JobStatusChip status={h.status} />
                                            <span>{JOB_TYPE_LABELS[h.job_type]} · {formatWhen(h.requested_at)} · {h.requested_by_name || '—'}</span>
                                            {h.voided && <span className="text-red-600 font-bold">voided</span>}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {garment && !job && (
                        <>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Reason</label>
                                <div className="flex flex-wrap gap-1.5 mb-2">
                                    {QUICK_REASONS.map(q => (
                                        <button key={q} type="button" onClick={() => setReason(q)}
                                            className={`px-2.5 py-1 rounded-full text-xs border ${reason === q ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>{q}</button>
                                    ))}
                                </div>
                                <input value={reason} onChange={e => setReason(e.target.value)} placeholder="Why is a new label needed?"
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Printer</label>
                                <div className="flex items-center gap-3 flex-wrap">
                                    <PrinterSelect printers={printers} value={printerId} onChange={setPrinterId} />
                                    <PrinterStatus printer={printer} />
                                </div>
                            </div>
                            {submitError && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-100">{submitError}</p>}
                        </>
                    )}

                    {job && (
                        <div className={`rounded-lg border p-3 text-sm ${job.status === 'PRINTED' ? 'bg-emerald-50 border-emerald-200' : job.status === 'FAILED' ? 'bg-red-50 border-red-200' : 'bg-blue-50 border-blue-200'}`}>
                            <div className="flex items-center gap-2 font-bold">
                                {job.status === 'PRINTED' ? <FiCheckCircle className="text-emerald-600" /> : job.status === 'FAILED' ? <FiAlertTriangle className="text-red-600" /> : <FiLoader className="animate-spin text-blue-600" />}
                                Job #{job.id} <JobStatusChip status={job.status} />
                            </div>
                            {job.status === 'QUEUED' && <p className="mt-1 text-gray-600">Waiting for the print agent{printer && !printer.agent_online ? ' — it is offline, the label prints when it is back' : ''}.</p>}
                            {job.status === 'PRINTED' && <p className="mt-1 text-emerald-800">The printer confirmed the label.</p>}
                            {job.status === 'FAILED' && <p className="mt-1 text-red-700">{job.error_message}</p>}
                        </div>
                    )}
                </div>

                <div className="flex gap-3 px-5 pb-5">
                    <button onClick={onClose} className="flex-1 px-4 py-2.5 text-sm font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg">{done ? 'Close' : 'Cancel'}</button>
                    {garment && !job && (
                        <button onClick={print} disabled={submitting || !printerId}
                            className="flex-1 px-4 py-2.5 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg flex items-center justify-center gap-2 disabled:opacity-50">
                            {submitting ? <FiLoader className="animate-spin" /> : <FiPrinter />} Print 1 label
                        </button>
                    )}
                    {done && (
                        <button onClick={() => { setJob(null); setGarment(null); setUid(''); setReason(''); setTimeout(() => inputRef.current?.focus(), 50); }}
                            className="flex-1 px-4 py-2.5 text-sm font-bold text-white bg-slate-800 hover:bg-slate-900 rounded-lg">Another label</button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default SingleLabelPrintModal;

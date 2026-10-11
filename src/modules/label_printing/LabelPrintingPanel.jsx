// Garment labels for one cutting batch: per roll printed / unprinted, print a roll,
// reprint, void (managers), single label by garment number, and the batch's jobs.
// Labels print through the print agent on the BarTender PC; a roll is "printed"
// only when the printer confirmed it.
import React, { useCallback, useEffect, useState } from 'react';
import { FiTag, FiPrinter, FiRefreshCw, FiAlertTriangle, FiSlash, FiRotateCcw, FiXCircle, FiLoader, FiCheckCircle } from 'react-icons/fi';
import { useAuth } from '../../context/AuthContext';
import { labelPrintingApi, LABEL_VIEW_ROLES, LABEL_PRINT_ROLES, LABEL_VOID_ROLES } from '../../api/labelPrintingApi';
import { JobStatusChip, JOB_TYPE_LABELS, PrinterSelect, PrinterStatus, ReasonModal, apiError, formatWhen } from './labelShared';
import SingleLabelPrintModal from './SingleLabelPrintModal';

const formatRollId = (rid) => String(rid ?? '');

const LabelPrintingPanel = (props) => {
    const { user } = useAuth();
    if (!LABEL_VIEW_ROLES.includes(user?.role)) return null;
    return <LabelPrintingPanelInner {...props} user={user} />;
};

const LabelPrintingPanelInner = ({ batchId, user }) => {
    const canPrint = LABEL_PRINT_ROLES.includes(user?.role);
    const canVoid = LABEL_VOID_ROLES.includes(user?.role);

    const [data, setData] = useState(null);
    const [printers, setPrinters] = useState([]);
    const [printerId, setPrinterId] = useState('');
    const [error, setError] = useState(null);
    const [notice, setNotice] = useState(null);
    const [busyRoll, setBusyRoll] = useState(null);
    const [dialog, setDialog] = useState(null);   // { kind: 'reprint' | 'void' | 'cancel', roll?, job? }
    const [singleOpen, setSingleOpen] = useState(false);
    const [showAllJobs, setShowAllJobs] = useState(false);

    const load = useCallback(async () => {
        try {
            const [b, p] = await Promise.all([labelPrintingApi.getBatchLabels(batchId), labelPrintingApi.getPrinters()]);
            setData(b.data);
            setPrinters(p.data);
            setPrinterId(prev => prev || String((p.data.find(x => x.is_default) || p.data[0] || {}).id || ''));
            setError(null);
        } catch (err) {
            setError(apiError(err, 'Could not load garment labels.'));
        }
    }, [batchId]);

    useEffect(() => { load(); }, [load]);

    // Links to …/batch-details/:id#labels land on this panel once it has loaded.
    const loaded = !!data;
    useEffect(() => {
        if (loaded && window.location.hash === '#labels') document.getElementById('labels')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, [loaded]);

    // Poll while anything is queued / printing.
    const hasOpenJobs = !!data?.jobs?.some(j => ['QUEUED', 'PRINTING'].includes(j.status));
    useEffect(() => {
        if (!hasOpenJobs) return undefined;
        const t = setInterval(load, 3000);
        return () => clearInterval(t);
    }, [hasOpenJobs, load]);

    const run = async (fn, okText) => {
        setNotice(null);
        try {
            await fn();
            if (okText) setNotice({ type: 'ok', text: okText });
            await load();
        } catch (err) {
            setNotice({ type: 'error', text: apiError(err, 'Something went wrong.') });
        }
    };

    const printRoll = async (roll) => {
        setBusyRoll(roll.fabric_roll_id);
        await run(() => labelPrintingApi.printRoll({ batchId, rollId: roll.fabric_roll_id, printerId }),
            `Roll ${formatRollId(roll.fabric_roll_id)}: ${roll.unprinted} label(s) + END label sent to the print queue.`);
        setBusyRoll(null);
    };

    const printAll = async () => {
        setBusyRoll('all');
        await run(async () => {
            const r = await labelPrintingApi.printBatch({ batchId, printerId });
            const skipped = r.data.skipped.length ? ` Skipped: ${r.data.skipped.map(x => `roll ${x.fabric_roll_id} (${x.reason})`).join(', ')}.` : '';
            setNotice({ type: 'ok', text: `${r.data.labels} label(s) in ${r.data.jobs.length} roll job(s) sent to the print queue.${skipped}` });
        });
        setBusyRoll(null);
    };
    const printAllCount = (data?.rolls || []).filter(r => r.can_print).reduce((n, r) => n + r.unprinted, 0);

    if (error) {
        return (
            <section className="bg-white rounded-lg shadow-sm border p-4 mb-6 text-sm text-red-700">
                <FiAlertTriangle className="inline mr-2" />{error}
            </section>
        );
    }
    if (!data) {
        return <section className="bg-white rounded-lg shadow-sm border p-6 mb-6 text-sm text-gray-500 flex items-center"><FiLoader className="animate-spin mr-2" /> Loading garment labels…</section>;
    }

    const printer = printers.find(p => String(p.id) === String(printerId));
    const cutRolls = data.rolls.filter(r => r.garments > 0);
    const jobs = showAllJobs ? data.jobs : data.jobs.slice(0, 8);

    return (
        <section id="labels" className="bg-white rounded-lg shadow-sm border overflow-hidden mb-6 print:hidden">
            <div className="p-4 border-b flex flex-wrap gap-3 justify-between items-center">
                <div>
                    <h3 className="text-lg font-semibold text-gray-800 flex items-center"><FiTag className="mr-3 text-indigo-500" />Garment Labels</h3>
                    <p className="text-xs text-gray-500 mt-0.5 ml-8">
                        <b className="text-emerald-700">{data.totals.printed}</b> printed · <b className={data.totals.unprinted ? 'text-amber-700' : 'text-gray-700'}>{data.totals.unprinted}</b> without label · {data.totals.garments} garments
                        {data.batch.piece_sequencing_mode === 'MODE_2' && <span className="ml-2 text-indigo-700 font-semibold">MODE_2 — labels once every roll is cut</span>}
                    </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    {canPrint && (
                        <>
                            <PrinterStatus printer={printer} />
                            <PrinterSelect printers={printers} value={printerId} onChange={setPrinterId} />
                            {printAllCount > 0 && (
                                <button onClick={printAll} disabled={busyRoll === 'all' || !printerId}
                                    className="px-3 py-1.5 text-sm font-bold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1.5">
                                    {busyRoll === 'all' ? <FiLoader className="animate-spin" size={14} /> : <FiPrinter size={14} />} Print all {printAllCount}
                                </button>
                            )}
                            <button onClick={() => setSingleOpen(true)} className="px-3 py-1.5 text-sm font-semibold rounded-lg border border-gray-300 hover:bg-gray-50 flex items-center gap-1.5">
                                <FiPrinter size={14} /> Single label
                            </button>
                        </>
                    )}
                    <button onClick={load} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500" title="Refresh"><FiRefreshCw size={14} /></button>
                </div>
            </div>

            {data.totals.unprinted > 0 && cutRolls.length > 0 && (
                <div className="px-4 py-2 bg-amber-50 border-b border-amber-100 text-sm text-amber-800 flex items-center gap-2">
                    <FiAlertTriangle className="shrink-0" /> {data.totals.unprinted} cut garment(s) have no label yet.
                </div>
            )}
            {notice && (
                <div className={`px-4 py-2 border-b text-sm flex items-center gap-2 ${notice.type === 'ok' ? 'bg-emerald-50 border-emerald-100 text-emerald-800' : 'bg-red-50 border-red-100 text-red-700'}`}>
                    {notice.type === 'ok' ? <FiCheckCircle className="shrink-0" /> : <FiAlertTriangle className="shrink-0" />} {notice.text}
                </div>
            )}

            <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                    <thead className="bg-gray-100 text-xs text-gray-600 uppercase tracking-wider">
                        <tr>
                            <th className="py-2.5 px-3 text-center">Seq</th>
                            <th className="py-2.5 px-3 text-left">Roll</th>
                            <th className="py-2.5 px-3 text-left">Sizes (printed / garments)</th>
                            <th className="py-2.5 px-3 text-right">Garments</th>
                            <th className="py-2.5 px-3 text-right">Printed</th>
                            <th className="py-2.5 px-3 text-right">No label</th>
                            <th className="py-2.5 px-3 text-left">Status</th>
                            {canPrint && <th className="py-2.5 px-3 text-right">Actions</th>}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {data.rolls.map(roll => {
                            const done = roll.garments > 0 && roll.unprinted === 0;
                            return (
                                <tr key={roll.fabric_roll_id} className="hover:bg-gray-50">
                                    <td className="py-2.5 px-3 text-center">
                                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-bold">{roll.roll_sequence}</span>
                                    </td>
                                    <td className="py-2.5 px-3 font-medium font-mono">{formatRollId(roll.fabric_roll_id)}</td>
                                    <td className="py-2.5 px-3">
                                        <div className="flex flex-wrap gap-1">
                                            {roll.sizes.map(s => (
                                                <span key={s.size} className={`px-1.5 py-0.5 rounded text-[11px] border ${s.printed === s.garments ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-gray-50 border-gray-200 text-gray-700'}`}>
                                                    {s.size}: {s.printed}/{s.garments}
                                                </span>
                                            ))}
                                            {roll.sizes.length === 0 && <span className="text-gray-300">—</span>}
                                        </div>
                                    </td>
                                    <td className="py-2.5 px-3 text-right">{roll.garments}</td>
                                    <td className="py-2.5 px-3 text-right text-emerald-700 font-semibold">{roll.printed}</td>
                                    <td className={`py-2.5 px-3 text-right font-semibold ${roll.unprinted ? 'text-amber-700' : 'text-gray-400'}`}>{roll.unprinted}</td>
                                    <td className="py-2.5 px-3">
                                        {roll.open_job ? <JobStatusChip status={roll.open_job.status} />
                                            : roll.block_reason ? <span className="text-xs text-gray-500">{roll.block_reason}</span>
                                                : done ? <span className="text-xs font-semibold text-emerald-700 flex items-center gap-1"><FiCheckCircle size={12} /> All labelled</span>
                                                    : <span className="text-xs text-amber-700">Ready to print</span>}
                                    </td>
                                    {canPrint && (
                                        <td className="py-2.5 px-3">
                                            <div className="flex justify-end gap-1.5">
                                                {roll.can_print && (
                                                    <button onClick={() => printRoll(roll)} disabled={busyRoll === roll.fabric_roll_id || !printerId}
                                                        className="px-2.5 py-1 text-xs font-bold rounded-md bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1">
                                                        {busyRoll === roll.fabric_roll_id ? <FiLoader className="animate-spin" size={12} /> : <FiPrinter size={12} />} Print {roll.unprinted}
                                                    </button>
                                                )}
                                                {roll.can_reprint && (
                                                    <button onClick={() => setDialog({ kind: 'reprint', roll })}
                                                        className="px-2.5 py-1 text-xs font-semibold rounded-md border border-gray-300 hover:bg-gray-100 flex items-center gap-1">
                                                        <FiRotateCcw size={12} /> Reprint
                                                    </button>
                                                )}
                                                {canVoid && roll.can_void && (
                                                    <button onClick={() => setDialog({ kind: 'void', roll })}
                                                        className="px-2.5 py-1 text-xs font-semibold rounded-md border border-red-200 text-red-700 hover:bg-red-50 flex items-center gap-1">
                                                        <FiSlash size={12} /> Void
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    )}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {data.jobs.length > 0 && (
                <div className="border-t">
                    <div className="px-4 py-2 text-xs font-bold text-gray-500 uppercase tracking-wider bg-gray-50">Print jobs</div>
                    <ul className="divide-y divide-gray-100">
                        {jobs.map(j => (
                            <li key={j.id} className="px-4 py-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                                <span className="font-mono text-gray-500">#{j.id}</span>
                                <JobStatusChip status={j.status} />
                                {j.voided_labels > 0 && <span className="text-[11px] font-bold uppercase text-red-700">{j.voided_labels === j.label_count ? 'voided' : `${j.voided_labels} voided`}</span>}
                                <span className="text-gray-800">{JOB_TYPE_LABELS[j.job_type]}{j.fabric_roll_id ? ` · roll ${formatRollId(j.fabric_roll_id)}` : ''} · {j.label_count} label(s)</span>
                                <span className="text-gray-500 text-xs">{j.requested_by_name || '—'} · {formatWhen(j.requested_at)} · {j.printer_name}</span>
                                {j.reason && <span className="text-gray-500 text-xs italic">“{j.reason}”</span>}
                                {j.status === 'FAILED' && j.error_message && <span className="basis-full text-xs text-red-700">{j.error_message}</span>}
                                {j.status === 'CANCELLED' && j.cancel_reason && <span className="text-xs text-gray-500">cancelled: {j.cancel_reason}</span>}
                                {canPrint && (
                                    <span className="ml-auto flex gap-1.5">
                                        {j.status === 'QUEUED' && (
                                            <button onClick={() => setDialog({ kind: 'cancel', job: j })} className="px-2 py-0.5 text-xs rounded border border-gray-300 hover:bg-gray-100 flex items-center gap-1"><FiXCircle size={11} /> Cancel</button>
                                        )}
                                        {j.status === 'FAILED' && (
                                            <button onClick={() => run(() => labelPrintingApi.retryJob(j.id, printerId), `Job #${j.id} sent again.`)}
                                                className="px-2 py-0.5 text-xs rounded border border-gray-300 hover:bg-gray-100 flex items-center gap-1"><FiRotateCcw size={11} /> Retry</button>
                                        )}
                                    </span>
                                )}
                            </li>
                        ))}
                    </ul>
                    {data.jobs.length > 8 && (
                        <button onClick={() => setShowAllJobs(v => !v)} className="w-full py-2 text-xs font-semibold text-indigo-600 hover:bg-gray-50">
                            {showAllJobs ? 'Show fewer' : `Show all ${data.jobs.length} jobs`}
                        </button>
                    )}
                </div>
            )}

            <ReasonModal
                isOpen={dialog?.kind === 'reprint'}
                title={`Reprint roll ${formatRollId(dialog?.roll?.fabric_roll_id)}`}
                description={`Prints all ${dialog?.roll?.garments} labels of this roll again, plus the END label.`}
                quickReasons={['Labels damaged', 'Labels lost', 'Printer jammed mid-roll', 'Misprinted']}
                confirmLabel="Reprint roll"
                onClose={() => setDialog(null)}
                onConfirm={async (reason) => {
                    await labelPrintingApi.printRoll({ batchId, rollId: dialog.roll.fabric_roll_id, printerId, reprint: true, reason });
                    setDialog(null);
                    setNotice({ type: 'ok', text: `Roll ${formatRollId(dialog.roll.fabric_roll_id)}: reprint sent to the print queue.` });
                    load();
                }}
            />
            <ReasonModal
                isOpen={dialog?.kind === 'void'}
                title={`Void labels of roll ${formatRollId(dialog?.roll?.fabric_roll_id)}`}
                description={`Marks the ${dialog?.roll?.printed} printed labels of this roll as invalid, so the roll can be cut again. Remove the old labels from the floor — after a re-cut their numbers may belong to other garments.`}
                quickReasons={['Roll to be re-cut', 'Wrong lay count entered']}
                confirmLabel="Void labels"
                confirmClass="bg-red-600 hover:bg-red-700"
                onClose={() => setDialog(null)}
                onConfirm={async (reason) => {
                    const r = await labelPrintingApi.voidRoll({ batchId, rollId: dialog.roll.fabric_roll_id, reason });
                    setDialog(null);
                    setNotice({ type: 'ok', text: `${r.data.garments_reset} label(s) voided. The roll can be cut again.` });
                    load();
                }}
            />
            <ReasonModal
                isOpen={dialog?.kind === 'cancel'}
                title={`Cancel print job #${dialog?.job?.id}`}
                description="The job has not been sent to the printer yet."
                quickReasons={['Wrong printer', 'Not needed']}
                confirmLabel="Cancel job"
                confirmClass="bg-slate-800 hover:bg-slate-900"
                onClose={() => setDialog(null)}
                onConfirm={async (reason) => {
                    await labelPrintingApi.cancelJob(dialog.job.id, reason);
                    setDialog(null);
                    load();
                }}
            />
            <SingleLabelPrintModal isOpen={singleOpen} onClose={() => { setSingleOpen(false); load(); }} />
        </section>
    );
};

export default LabelPrintingPanel;

// Label print queue across all batches: what is waiting / printing / failed,
// printer readiness, and single-label printing by garment number.
import React, { useCallback, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { FiPrinter, FiRefreshCw, FiRotateCcw, FiXCircle, FiAlertTriangle } from 'react-icons/fi';
import { useAuth } from '../../context/AuthContext';
import { labelPrintingApi, LABEL_PRINT_ROLES } from '../../api/labelPrintingApi';
import { JobStatusChip, JOB_TYPE_LABELS, PrinterStatus, ReasonModal, apiError, formatWhen } from './labelShared';
import SingleLabelPrintModal from './SingleLabelPrintModal';

const FILTERS = [
    { key: 'open', label: 'Waiting / printing', status: 'QUEUED,PRINTING' },
    { key: 'failed', label: 'Failed', status: 'FAILED' },
    { key: 'all', label: 'All', status: '' },
];

const LabelPrintQueuePage = () => {
    const { user } = useAuth();
    const location = useLocation();
    const canPrint = LABEL_PRINT_ROLES.includes(user?.role);
    const batchBase = location.pathname.startsWith('/admin') ? null : '/cutting-portal/batch-details';

    const [filter, setFilter] = useState('open');
    const [jobs, setJobs] = useState([]);
    const [printers, setPrinters] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [notice, setNotice] = useState(null);
    const [singleOpen, setSingleOpen] = useState(false);
    const [cancelJob, setCancelJob] = useState(null);

    const load = useCallback(async () => {
        try {
            const status = FILTERS.find(f => f.key === filter).status;
            const [j, p] = await Promise.all([
                labelPrintingApi.listJobs({ ...(status ? { status } : {}), limit: 200 }),
                labelPrintingApi.getPrinters(),
            ]);
            setJobs(j.data); setPrinters(p.data); setError(null);
        } catch (err) {
            setError(apiError(err, 'Could not load the print queue.'));
        } finally { setLoading(false); }
    }, [filter]);

    useEffect(() => { setLoading(true); load(); }, [load]);
    useEffect(() => {
        const t = setInterval(load, 5000);
        return () => clearInterval(t);
    }, [load]);

    const retry = async (job) => {
        setNotice(null);
        try {
            const r = await labelPrintingApi.retryJob(job.id);
            setNotice({ type: 'ok', text: `Job #${job.id} sent again as job #${r.data.id}.` });
            load();
        } catch (err) { setNotice({ type: 'error', text: apiError(err, 'Retry failed.') }); }
    };

    return (
        <div className="max-w-6xl mx-auto">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><FiPrinter className="text-indigo-600" /> Label Printing</h1>
                    <p className="text-sm text-gray-500">Garment labels print on the BarTender PC. A job counts as printed only when the printer confirms it.</p>
                </div>
                <div className="flex gap-2">
                    {canPrint && (
                        <button onClick={() => setSingleOpen(true)} className="px-3 py-2 text-sm font-bold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 flex items-center gap-1.5">
                            <FiPrinter size={14} /> Print single label
                        </button>
                    )}
                    <button onClick={load} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600" title="Refresh"><FiRefreshCw size={16} /></button>
                </div>
            </div>

            <div className="bg-white rounded-lg border shadow-sm p-3 mb-4 flex flex-wrap gap-x-6 gap-y-2">
                {printers.length === 0 && <span className="text-sm text-amber-700 flex items-center gap-2"><FiAlertTriangle /> No label printer is set up yet (Admin → Label Printers).</span>}
                {printers.map(p => (
                    <div key={p.id} className="text-sm flex items-center gap-2">
                        <span className="font-semibold text-gray-800">{p.name}{p.is_default ? ' (default)' : ''}</span>
                        <PrinterStatus printer={p} />
                    </div>
                ))}
            </div>

            <div className="flex gap-1 mb-3">
                {FILTERS.map(f => (
                    <button key={f.key} onClick={() => setFilter(f.key)}
                        className={`px-3 py-1.5 rounded-lg text-sm font-semibold ${filter === f.key ? 'bg-slate-800 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>{f.label}</button>
                ))}
            </div>

            {notice && <div className={`mb-3 px-3 py-2 rounded-lg text-sm border ${notice.type === 'ok' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-700'}`}>{notice.text}</div>}
            {error && <div className="mb-3 px-3 py-2 rounded-lg text-sm border bg-red-50 border-red-200 text-red-700">{error}</div>}

            <div className="bg-white rounded-lg border shadow-sm overflow-x-auto">
                <table className="min-w-full text-sm">
                    <thead className="bg-gray-100 text-xs text-gray-600 uppercase tracking-wider">
                        <tr>
                            <th className="py-2.5 px-3 text-left">Job</th>
                            <th className="py-2.5 px-3 text-left">Status</th>
                            <th className="py-2.5 px-3 text-left">Batch / roll</th>
                            <th className="py-2.5 px-3 text-left">Type</th>
                            <th className="py-2.5 px-3 text-right">Labels</th>
                            <th className="py-2.5 px-3 text-left">Printer</th>
                            <th className="py-2.5 px-3 text-left">Requested</th>
                            {canPrint && <th className="py-2.5 px-3" />}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {!loading && jobs.length === 0 && (
                            <tr><td colSpan={8} className="py-8 text-center text-gray-400">{filter === 'open' ? 'Nothing waiting to print.' : 'No jobs.'}</td></tr>
                        )}
                        {jobs.map(j => (
                            <React.Fragment key={j.id}>
                                <tr className="hover:bg-gray-50">
                                    <td className="py-2.5 px-3 font-mono text-gray-500">#{j.id}</td>
                                    <td className="py-2.5 px-3 whitespace-nowrap"><JobStatusChip status={j.status} />{j.voided_labels > 0 && <span className="ml-1.5 text-[11px] font-bold uppercase text-red-700">{j.voided_labels === j.label_count ? 'voided' : `${j.voided_labels} voided`}</span>}</td>
                                    <td className="py-2.5 px-3">
                                        {batchBase
                                            ? <Link to={`${batchBase}/${j.production_batch_id}#labels`} className="text-indigo-600 hover:underline font-medium">{j.batch_code || `#${j.production_batch_id}`}</Link>
                                            : <span className="font-medium">{j.batch_code || `#${j.production_batch_id}`}</span>}
                                        {j.fabric_roll_id && <span className="text-gray-500"> · roll {j.fabric_roll_id}</span>}
                                    </td>
                                    <td className="py-2.5 px-3">{JOB_TYPE_LABELS[j.job_type]}</td>
                                    <td className="py-2.5 px-3 text-right">{j.label_count}{j.has_end_label ? ' + END' : ''}</td>
                                    <td className="py-2.5 px-3">{j.printer_name}</td>
                                    <td className="py-2.5 px-3 text-gray-600">{formatWhen(j.requested_at)} · {j.requested_by_name || '—'}</td>
                                    {canPrint && (
                                        <td className="py-2.5 px-3 text-right whitespace-nowrap">
                                            {j.status === 'QUEUED' && <button onClick={() => setCancelJob(j)} className="px-2 py-0.5 text-xs rounded border border-gray-300 hover:bg-gray-100 inline-flex items-center gap-1"><FiXCircle size={11} /> Cancel</button>}
                                            {j.status === 'FAILED' && <button onClick={() => retry(j)} className="px-2 py-0.5 text-xs rounded border border-gray-300 hover:bg-gray-100 inline-flex items-center gap-1"><FiRotateCcw size={11} /> Retry</button>}
                                        </td>
                                    )}
                                </tr>
                                {(j.reason || (j.status === 'FAILED' && j.error_message)) && (
                                    <tr className="bg-gray-50/50">
                                        <td />
                                        <td colSpan={7} className="px-3 pb-2 text-xs">
                                            {j.reason && <span className="text-gray-500 italic mr-3">“{j.reason}”</span>}
                                            {j.status === 'FAILED' && j.error_message && <span className="text-red-700">{j.error_message}</span>}
                                        </td>
                                    </tr>
                                )}
                            </React.Fragment>
                        ))}
                    </tbody>
                </table>
            </div>

            <SingleLabelPrintModal isOpen={singleOpen} onClose={() => { setSingleOpen(false); load(); }} />
            <ReasonModal
                isOpen={!!cancelJob}
                title={`Cancel print job #${cancelJob?.id}`}
                description="The job has not been sent to the printer yet."
                quickReasons={['Wrong printer', 'Not needed']}
                confirmLabel="Cancel job"
                confirmClass="bg-slate-800 hover:bg-slate-900"
                onClose={() => setCancelJob(null)}
                onConfirm={async (reason) => { await labelPrintingApi.cancelJob(cancelJob.id, reason); setCancelJob(null); load(); }}
            />
        </div>
    );
};

export default LabelPrintQueuePage;

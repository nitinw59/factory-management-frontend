import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { finalQcApi } from '../../api/finalQcApi';
import { inspectionStatusOf, resultOf, severityOf } from './finalQcStatusConfig';
import StatusTimeline from './StatusTimeline';
import {
    Loader2, ArrowLeft, RefreshCw, AlertCircle, ShieldCheck, ClipboardList, History,
    ShieldAlert, Lock, X,
} from 'lucide-react';

const WAIVE_CLOSE_ROLES = ['factory_admin', 'quality_manager', 'production_manager'];

const fmtDateTime = (d) => d ? new Date(d).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—';

const Tile = ({ label, children }) => (
    <div>
        <p className="text-[10px] uppercase tracking-wider font-bold text-gray-400">{label}</p>
        <p className="font-semibold text-gray-800 mt-0.5">{children}</p>
    </div>
);

const Section = ({ icon: Icon, title, children, right }) => (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center">
                <Icon className="w-4 h-4 mr-2 text-indigo-600" />
                <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider">{title}</h3>
            </div>
            {right}
        </div>
        <div className="p-5">{children}</div>
    </div>
);

// Confirm dialog requiring a typed reason — used for waive (the "let a failed
// lot ship anyway" override).
const ReasonConfirmModal = ({ title, hint, requireNotes, confirmLabel, confirmClass, busy, onConfirm, onClose }) => {
    const [notes, setNotes] = useState('');
    const canConfirm = !requireNotes || notes.trim().length > 0;
    return (
        <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={!busy ? onClose : undefined}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
                <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-gray-100">
                    <h3 className="text-base font-black text-gray-900">{title}</h3>
                    {!busy && <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full"><X size={16} className="text-gray-500" /></button>}
                </div>
                <div className="px-5 py-4 space-y-3">
                    {hint && <p className="text-sm text-gray-500">{hint}</p>}
                    <div>
                        <label className="text-[10px] uppercase tracking-wider font-bold text-gray-400">
                            Notes {requireNotes ? <span className="text-red-500">*</span> : <span className="normal-case font-medium text-gray-300">(optional)</span>}
                        </label>
                        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} autoFocus
                            placeholder={requireNotes ? 'Why is this being overridden?' : ''}
                            className="w-full mt-1 border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
                    </div>
                </div>
                <div className="flex justify-end gap-2 px-5 py-3 border-t border-gray-100">
                    <button onClick={onClose} disabled={busy} className="text-sm font-medium text-gray-500 hover:text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-100 disabled:opacity-40">
                        Cancel
                    </button>
                    <button onClick={() => onConfirm(notes.trim())} disabled={busy || !canConfirm}
                        className={`flex items-center gap-2 text-sm font-bold text-white px-4 py-2 rounded-lg transition disabled:opacity-40 ${confirmClass}`}>
                        {busy ? <Loader2 size={14} className="animate-spin" /> : null}
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
};

const FinalQcDetailPage = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);
    const [refreshing, setRefreshing] = useState(false);
    const [confirmAction, setConfirmAction] = useState(null); // 'waive' | 'close' | null
    const [actionBusy, setActionBusy] = useState(false);
    const [actionErr, setActionErr] = useState(null);

    const fetchInspection = useCallback(async () => {
        setRefreshing(true);
        setError(null);
        try {
            const res = await finalQcApi.getInspection(id);
            setData(res.data);
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to load inspection.');
        } finally {
            setRefreshing(false);
        }
    }, [id]);

    useEffect(() => { fetchInspection(); }, [fetchInspection]);

    const canWaiveOrClose = WAIVE_CLOSE_ROLES.includes(user?.role);

    const runAction = async (notes) => {
        setActionBusy(true);
        setActionErr(null);
        try {
            if (confirmAction === 'waive') await finalQcApi.waiveInspection(id, notes);
            else await finalQcApi.closeInspection(id, notes);
            setConfirmAction(null);
            await fetchInspection();
        } catch (e) {
            setActionErr(e?.response?.data?.error || `Failed to ${confirmAction} inspection.`);
        } finally {
            setActionBusy(false);
        }
    };

    if (error && !data) {
        return (
            <div className="max-w-4xl mx-auto">
                <button onClick={() => navigate(-1)} className="text-sm text-indigo-600 hover:underline flex items-center font-semibold mb-4">
                    <ArrowLeft className="w-4 h-4 mr-2" /> Back
                </button>
                <div className="p-4 bg-red-50 text-red-700 rounded-xl border border-red-200 flex items-center text-sm font-medium">
                    <AlertCircle className="h-5 w-5 mr-3 shrink-0" /> {error}
                </div>
            </div>
        );
    }
    if (!data) {
        return <div className="flex justify-center p-16"><Loader2 className="animate-spin h-10 w-10 text-indigo-600" /></div>;
    }

    const c = data;
    const meta = inspectionStatusOf(c.status);
    const rmeta = resultOf(c.result);

    return (
        <div className="max-w-4xl mx-auto space-y-5">
            <div className="flex items-center justify-between">
                <button onClick={() => navigate(-1)} className="text-sm text-indigo-600 hover:underline flex items-center font-semibold">
                    <ArrowLeft className="w-4 h-4 mr-2" /> Back
                </button>
                <button onClick={fetchInspection} disabled={refreshing} className="p-2 bg-white border border-gray-300 rounded-lg shadow-sm hover:bg-gray-50 text-gray-600 disabled:opacity-50" title="Refresh">
                    <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin text-indigo-600' : ''}`} />
                </button>
            </div>

            {error && (
                <div className="p-3 bg-red-50 text-red-700 rounded-lg border border-red-200 flex items-center text-sm font-medium">
                    <AlertCircle className="h-4 w-4 mr-2 shrink-0" /> {error}
                </div>
            )}
            {actionErr && (
                <div className="p-3 bg-red-50 text-red-700 rounded-lg border border-red-200 flex items-center text-sm font-medium">
                    <AlertCircle className="h-4 w-4 mr-2 shrink-0" /> {actionErr}
                </div>
            )}

            {/* Header */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="min-w-0">
                        <div className="flex items-center gap-3 flex-wrap">
                            <h1 className="text-2xl font-extrabold text-gray-900 flex items-center">
                                <ShieldCheck className="w-6 h-6 mr-2.5 text-indigo-600" /> {c.inspection_code || `FQC-${id}`}
                            </h1>
                            <span className={`px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider rounded-full border ${meta.badge}`}>{meta.label}</span>
                            <span className={`px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider rounded-full border ${rmeta.badge}`}>{rmeta.label}</span>
                        </div>
                        <p className="text-sm text-gray-600 mt-2 font-semibold">{c.batch_code || `Batch #${c.production_batch_id}`}</p>
                        {c.packing_list_code && <p className="text-xs text-gray-400 mt-0.5">Packing list: {c.packing_list_code}</p>}
                        {c.notes && <p className="text-sm text-gray-500 mt-1 italic">“{c.notes}”</p>}
                    </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-5 pt-4 border-t border-gray-100 text-sm">
                    <Tile label="Sample / Lot">{c.sample_size} / {c.lot_size}</Tile>
                    <Tile label="AQL Level">{c.aql_level}</Tile>
                    <Tile label="Critical / Major / Minor">
                        <span className="font-mono">{c.critical_defect_count} / {c.major_defect_count} (≤{c.major_defect_limit}) / {c.minor_defect_count} (≤{c.minor_defect_limit})</span>
                    </Tile>
                    <Tile label="Inspected by">{c.inspected_by_name || '—'}</Tile>
                    <Tile label="Inspection date">{fmtDateTime(c.inspection_date)}</Tile>
                    {c.previous_inspection_code && <Tile label="Previous inspection">{c.previous_inspection_code}</Tile>}
                    {c.closed_by_name && <Tile label="Closed by">{c.closed_by_name}</Tile>}
                    {c.closed_at && <Tile label="Closed at">{fmtDateTime(c.closed_at)}</Tile>}
                </div>
            </div>

            {/* Actions */}
            {canWaiveOrClose && (c.status === 'FAILED' || c.status === 'PASSED' || c.status === 'WAIVED') && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 flex items-center gap-3 flex-wrap">
                    {c.status === 'FAILED' && (
                        <button onClick={() => setConfirmAction('waive')}
                            className="flex items-center gap-1.5 text-sm font-bold text-white bg-amber-600 hover:bg-amber-700 px-4 py-2 rounded-lg transition shadow-sm">
                            <ShieldAlert size={15} /> Waive — let this lot ship anyway
                        </button>
                    )}
                    {(c.status === 'PASSED' || c.status === 'WAIVED') && (
                        <button onClick={() => setConfirmAction('close')}
                            className="flex items-center gap-1.5 text-sm font-bold text-white bg-gray-700 hover:bg-gray-800 px-4 py-2 rounded-lg transition shadow-sm">
                            <Lock size={15} /> Close inspection
                        </button>
                    )}
                </div>
            )}

            {/* Defects */}
            <Section icon={ClipboardList} title={`Defect Lines (${(c.defects || []).length})`}>
                {(c.defects || []).length === 0 ? (
                    <p className="text-sm text-gray-400 font-medium">Clean sample — no defects logged.</p>
                ) : (
                    <div className="border border-gray-200 rounded-lg overflow-hidden overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-gray-50 text-[10px] uppercase text-gray-500 font-bold">
                                <tr>
                                    <th className="px-3 py-2 text-left">Code</th>
                                    <th className="px-3 py-2 text-left">Description</th>
                                    <th className="px-3 py-2 text-left">Severity</th>
                                    <th className="px-3 py-2 text-right">Qty</th>
                                    <th className="px-3 py-2 text-left">Unit</th>
                                    <th className="px-3 py-2 text-left">Responsible</th>
                                    <th className="px-3 py-2 text-left">Notes</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {c.defects.map(d => {
                                    const smeta = severityOf(d.severity);
                                    return (
                                        <tr key={d.id}>
                                            <td className="px-3 py-2 font-mono font-bold text-gray-800 whitespace-nowrap">{d.defect_code}</td>
                                            <td className="px-3 py-2 text-gray-600">
                                                {d.description}
                                                {d.category && <span className="text-[10px] text-gray-400 uppercase ml-1.5">{d.category}</span>}
                                            </td>
                                            <td className="px-3 py-2">
                                                <span className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full border ${smeta.badge}`}>{smeta.label}</span>
                                            </td>
                                            <td className="px-3 py-2 text-right font-mono">{d.quantity}</td>
                                            <td className="px-3 py-2 text-gray-500 font-mono text-xs">{d.unit_identifier || '—'}</td>
                                            <td className="px-3 py-2 text-gray-500">{d.responsible_operator_name || '—'}</td>
                                            <td className="px-3 py-2 text-gray-500 text-xs">{d.notes || '—'}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </Section>

            {/* Timeline */}
            <Section icon={History} title="Status timeline">
                <StatusTimeline history={c.status_history} />
            </Section>

            {confirmAction && (
                <ReasonConfirmModal
                    title={confirmAction === 'waive' ? 'Waive this failed inspection?' : 'Close this inspection?'}
                    hint={confirmAction === 'waive'
                        ? 'This overrides a FAILED result to let the lot ship anyway — the reason is recorded on the timeline.'
                        : 'Typically done once dispatch has actually happened against this inspection.'}
                    requireNotes={confirmAction === 'waive'}
                    confirmLabel={confirmAction === 'waive' ? 'Waive & Allow Dispatch' : 'Close'}
                    confirmClass={confirmAction === 'waive' ? 'bg-amber-600 hover:bg-amber-700' : 'bg-gray-700 hover:bg-gray-800'}
                    busy={actionBusy}
                    onConfirm={runAction}
                    onClose={() => setConfirmAction(null)}
                />
            )}
        </div>
    );
};

export default FinalQcDetailPage;

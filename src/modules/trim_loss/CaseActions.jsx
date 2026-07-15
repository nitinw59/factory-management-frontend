import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { trimLossApi } from '../../api/trimLossApi';
import { SEARCH_CHECKLIST } from './ReportMissingModal';
import FixResponsibilityModal from './FixResponsibilityModal';
import ReplacementPanel from './ReplacementPanel';
import { Loader2, AlertTriangle, CheckCircle2, X, Search, PackageX, Scale, Gavel, Ban, CheckCheck, PlayCircle } from 'lucide-react';

const REPORTER_ROLES = ['line_loader', 'line_supervisor', 'line_manager', 'production_manager', 'factory_admin'];
const PM_ROLES = ['production_manager', 'factory_admin'];
const SECOND_APPROVER_ROLES = ['factory_admin', 'purchase_manager'];
// Replacement is offered once responsibility is fixed (or later, incl. after a slip is already issued).
const REPLACEMENT_STATUSES = ['RESPONSIBILITY_FIXED', 'DEBIT_APPROVED', 'CLOSED'];

const Banner = ({ msg, onClose }) => msg && (
    <div className={`mb-3 p-3 rounded-lg text-sm font-medium flex items-start ${msg.kind === 'error' ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200'}`}>
        {msg.kind === 'error' ? <AlertTriangle className="w-4 h-4 mr-2 shrink-0 mt-0.5" /> : <CheckCircle2 className="w-4 h-4 mr-2 shrink-0 mt-0.5" />}
        <span className="flex-1">{msg.text}</span>
        <button onClick={onClose} className="ml-2 opacity-60 hover:opacity-100"><X className="w-3.5 h-3.5" /></button>
    </div>
);

const Zone = ({ title, hint, children }) => (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100">
            <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider">{title}</h3>
            {hint && <p className="text-xs text-gray-400 font-medium mt-0.5">{hint}</p>}
        </div>
        <div className="p-5">{children}</div>
    </div>
);

// ── Search outcome (reporters, only from REPORTED) ──
const SearchOutcomeZone = ({ caseData, onChanged }) => {
    const missing = Number(caseData.missing_qty) || 0;
    const [outcome, setOutcome] = useState('not_found'); // 'found' | 'not_found'
    const [foundQty, setFoundQty] = useState(String(missing || 1));
    const [notes, setNotes] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [msg, setMsg] = useState(null);

    const qtyNum = parseInt(foundQty, 10);
    const foundQtyValid = outcome !== 'found' || (Number.isInteger(qtyNum) && qtyNum > 0 && (!missing || qtyNum <= missing));

    const submit = async () => {
        if (!foundQtyValid) return;
        setSubmitting(true);
        setMsg(null);
        try {
            const payload = { outcome, notes: notes.trim() || undefined };
            if (outcome === 'found') payload.found_qty = qtyNum;
            const res = await trimLossApi.recordSearchOutcome(caseData.id, payload);
            console.log('[trimloss] recordSearchOutcome raw:', res.data);
            const full = outcome === 'found' && (!missing || qtyNum >= missing);
            setMsg({ kind: 'success', text: full ? 'Everything found — logged as a near-miss and closed.' : 'Escalated to the production manager.' });
            if (onChanged) await onChanged();
        } catch (err) {
            setMsg({ kind: 'error', text: err.response?.data?.error || 'Failed to record search outcome.' });
            setSubmitting(false);
        }
    };

    return (
        <Zone title="Search outcome" hint="Search within the shift, then record what you found.">
            <Banner msg={msg} onClose={() => setMsg(null)} />
            <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700 mb-1.5 flex items-center"><Search className="w-3.5 h-3.5 mr-1.5" /> Where to look</p>
                <ul className="list-disc list-inside space-y-0.5 text-xs text-gray-700">
                    {SEARCH_CHECKLIST.map((s, i) => <li key={i}>{s}</li>)}
                </ul>
            </div>
            <div className="flex gap-2 mb-3">
                {['not_found', 'found'].map(o => (
                    <button
                        key={o}
                        onClick={() => setOutcome(o)}
                        className={`px-4 py-2 rounded-lg text-sm font-bold border transition-colors ${outcome === o ? (o === 'found' ? 'bg-green-600 text-white border-green-600' : 'bg-red-600 text-white border-red-600') : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                    >
                        {o === 'found' ? 'Found' : 'Not found'}
                    </button>
                ))}
            </div>
            {outcome === 'found' && (
                <div className="mb-3">
                    <label className="text-[10px] uppercase tracking-wider font-bold text-gray-400">Quantity found {missing ? <span className="normal-case font-medium">(of {missing} missing)</span> : ''}</label>
                    <input
                        type="number" min="1" max={missing || undefined} step="1"
                        value={foundQty}
                        onChange={e => setFoundQty(e.target.value)}
                        onWheel={e => e.target.blur()}
                        className={`mt-1 w-32 border rounded-lg p-2.5 text-center font-bold text-sm outline-none focus:ring-2 ${foundQtyValid ? 'border-gray-300 focus:ring-indigo-500' : 'border-red-400 bg-red-50 text-red-700 focus:ring-red-400'}`}
                    />
                    <p className="text-xs text-gray-500 mt-1">{missing && qtyNum < missing ? `Partial — the remaining ${Math.max(0, missing - qtyNum)} escalates.` : 'Full recovery — logs as a near-miss.'}</p>
                </div>
            )}
            <div className="mb-3">
                <label className="text-[10px] uppercase tracking-wider font-bold text-gray-400">Notes (optional)</label>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className="mt-1 w-full border border-gray-300 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <button onClick={submit} disabled={submitting || !foundQtyValid} className="px-5 py-2.5 bg-indigo-600 text-white rounded-lg font-bold text-sm hover:bg-indigo-700 disabled:opacity-50 flex items-center">
                {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <PackageX className="w-4 h-4 mr-2" />}
                Record outcome
            </button>
        </Zone>
    );
};

// A button that expands to a notes field before firing (start-investigation / cancel / close).
const NotesAction = ({ label, icon: Icon, tone, required, onConfirm, busy }) => {
    const [open, setOpen] = useState(false);
    const [notes, setNotes] = useState('');
    const toneCls = tone === 'danger'
        ? 'bg-white text-rose-600 border-rose-200 hover:bg-rose-50'
        : 'bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-700';
    if (!open) {
        return (
            <button onClick={() => setOpen(true)} className={`flex items-center px-4 py-2.5 rounded-lg text-sm font-bold border transition-colors ${toneCls}`}>
                <Icon className="w-4 h-4 mr-2" /> {label}
            </button>
        );
    }
    return (
        <div className="w-full border border-gray-200 rounded-lg p-3 bg-gray-50">
            <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={2}
                placeholder={required ? 'Notes (required)…' : 'Notes (optional)…'}
                className="w-full border border-gray-300 rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <div className="flex gap-2 mt-2">
                <button onClick={() => { setOpen(false); setNotes(''); }} disabled={busy} className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-bold hover:bg-gray-200 disabled:opacity-50">Cancel</button>
                <button
                    onClick={() => onConfirm(notes.trim())}
                    disabled={busy || (required && !notes.trim())}
                    className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center disabled:opacity-50 ${tone === 'danger' ? 'bg-rose-600 text-white hover:bg-rose-700' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}
                >
                    {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Icon className="w-4 h-4 mr-2" />} {label}
                </button>
            </div>
        </div>
    );
};

// ── PM investigation → responsibility → approval → close/cancel ──
const PmZone = ({ caseData, onChanged }) => {
    const status = caseData.status;
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState(null);
    const [showFix, setShowFix] = useState(false);
    const hasNotes = (caseData.debit_notes || []).length > 0;
    const cancellable = ['ESCALATED', 'UNDER_INVESTIGATION'].includes(status);

    const run = async (fn, successText) => {
        setBusy(true);
        setMsg(null);
        try {
            const res = await fn();
            console.log('[trimloss] pm action raw:', res?.data);
            setMsg({ kind: 'success', text: successText });
            if (onChanged) await onChanged();
        } catch (err) {
            setMsg({ kind: 'error', text: err.response?.data?.error || 'Action failed.' });
        } finally {
            setBusy(false);
        }
    };

    const approve = () => {
        if (!window.confirm('Approve all pending debit notes? This hands the case to HR for salary recovery — there is no separate send-to-HR step.')) return;
        run(() => trimLossApi.approveDebits(caseData.id), 'Debit notes approved — HR notified for recovery.');
    };

    let hint = '';
    if (status === 'ESCALATED') hint = 'Review the custody trail above, then start the investigation.';
    else if (status === 'UNDER_INVESTIGATION') hint = 'Fix responsibility by splitting the outstanding qty across employees, or write it off.';
    else if (status === 'RESPONSIBILITY_FIXED') hint = hasNotes ? 'Approve the debit notes to hand off to HR, or re-split before approving.' : 'Written off — close the case once nothing is outstanding.';

    return (
        <Zone title="Production manager" hint={hint}>
            <Banner msg={msg} onClose={() => setMsg(null)} />
            <div className="flex flex-wrap items-start gap-2">
                {status === 'ESCALATED' && (
                    <NotesAction label="Start investigation" icon={PlayCircle} onConfirm={(notes) => run(() => trimLossApi.startInvestigation(caseData.id, { notes: notes || undefined }), 'Investigation started.')} busy={busy} />
                )}
                {status === 'UNDER_INVESTIGATION' && (
                    <button onClick={() => setShowFix(true)} className="flex items-center px-4 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700">
                        <Scale className="w-4 h-4 mr-2" /> Fix responsibility
                    </button>
                )}
                {status === 'RESPONSIBILITY_FIXED' && hasNotes && (
                    <>
                        <button onClick={approve} disabled={busy} className="flex items-center px-4 py-2.5 bg-green-600 text-white rounded-lg text-sm font-bold hover:bg-green-700 disabled:opacity-50">
                            {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCheck className="w-4 h-4 mr-2" />} Approve debit notes
                        </button>
                        <button onClick={() => setShowFix(true)} disabled={busy} className="flex items-center px-4 py-2.5 bg-white text-indigo-600 border border-indigo-200 rounded-lg text-sm font-bold hover:bg-indigo-50 disabled:opacity-50">
                            <Scale className="w-4 h-4 mr-2" /> Re-split
                        </button>
                    </>
                )}
                {status === 'RESPONSIBILITY_FIXED' && !hasNotes && (
                    <NotesAction label="Close case" icon={Gavel} onConfirm={(notes) => run(() => trimLossApi.closeCase(caseData.id, { notes: notes || undefined }), 'Case closed.')} busy={busy} />
                )}
                {cancellable && (
                    <NotesAction label="Cancel (false alarm)" icon={Ban} tone="danger" onConfirm={(notes) => run(() => trimLossApi.cancelCase(caseData.id, { notes: notes || undefined }), 'Case cancelled.')} busy={busy} />
                )}
            </div>
            {showFix && (
                <FixResponsibilityModal
                    caseData={caseData}
                    onClose={() => setShowFix(false)}
                    onDone={async () => { setShowFix(false); setMsg({ kind: 'success', text: 'Responsibility fixed — debit notes raised.' }); if (onChanged) await onChanged(); }}
                />
            )}
        </Zone>
    );
};

// Orchestrates all role-gated action zones on the case-detail page.
const CaseActions = ({ caseData, onChanged }) => {
    const { user } = useAuth();
    const role = user?.role;
    const isReporter = REPORTER_ROLES.includes(role);
    const isPm = PM_ROLES.includes(role);
    const isSecond = SECOND_APPROVER_ROLES.includes(role);
    const status = caseData?.status;
    const replacementStarted = caseData?.replacement_mode || caseData?.replacement_issue_id;

    const zones = [];

    if (isReporter && status === 'REPORTED') {
        zones.push(<SearchOutcomeZone key="search" caseData={caseData} onChanged={onChanged} />);
    }

    if (isPm && ['ESCALATED', 'UNDER_INVESTIGATION', 'RESPONSIBILITY_FIXED'].includes(status)) {
        zones.push(<PmZone key="pm" caseData={caseData} onChanged={onChanged} />);
    }

    if ((isPm || isSecond) && (REPLACEMENT_STATUSES.includes(status) || replacementStarted)) {
        zones.push(<ReplacementPanel key="replacement" caseData={caseData} onChanged={onChanged} />);
    }

    if (zones.length === 0) return null;
    return <div className="space-y-5">{zones}</div>;
};

export default CaseActions;

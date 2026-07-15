import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { trimLossApi } from '../../api/trimLossApi';
import { hrApi } from '../../api/hrApi';
import SearchableSelect from '../../shared/SearchableSelect';
import { fmtDateTime } from './format';
import { Loader2, AlertTriangle, CheckCircle2, X, Repeat, PackageCheck, ShoppingCart, Stamp } from 'lucide-react';

const PM_ROLES = ['production_manager', 'factory_admin'];
const SECOND_APPROVER_ROLES = ['factory_admin', 'purchase_manager'];

const Banner = ({ msg, onClose }) => msg && (
    <div className={`mb-3 p-3 rounded-lg text-sm font-medium flex items-start ${msg.kind === 'error' ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200'}`}>
        {msg.kind === 'error' ? <AlertTriangle className="w-4 h-4 mr-2 shrink-0 mt-0.5" /> : <CheckCircle2 className="w-4 h-4 mr-2 shrink-0 mt-0.5" />}
        <span className="flex-1">{msg.text}</span>
        <button onClick={onClose} className="ml-2 opacity-60 hover:opacity-100"><X className="w-3.5 h-3.5" /></button>
    </div>
);

// Replacement runs in parallel to the debit stepper. State is driven off the case's replacement_* fields.
const ReplacementPanel = ({ caseData, onChanged }) => {
    const { user } = useAuth();
    const role = user?.role;
    const isPm = PM_ROLES.includes(role);
    const isSecond = SECOND_APPROVER_ROLES.includes(role);

    const issued = caseData.replacement_issue_id || caseData.replacement_issue_number;
    const mode = caseData.replacement_mode; // STOCK | PURCHASE | null
    const pmApproved = caseData.replacement_pm_approved_by || caseData.replacement_pm_approved_at;
    const secondApproved = caseData.replacement_second_approved_by || caseData.replacement_second_approved_at;
    const requirementId = caseData.replacement_requirement_id;

    // Kit slips have no recipient — the picker is required when issuing from stock against one.
    const slip = caseData.original_slip || caseData.slip || {};
    const isKitSlip = slip.is_kit_slip ?? !(slip.issued_to_employee_id || caseData.issued_to_employee_id || slip.issued_to_name);

    const [employees, setEmployees] = useState([]);
    const [issuedTo, setIssuedTo] = useState('');
    const [busy, setBusy] = useState(null); // 'stock' | 'request' | 'approve'
    const [msg, setMsg] = useState(null);

    useEffect(() => {
        if (issued) return;
        hrApi.getAllEmployees()
            .then(r => {
                const list = Array.isArray(r.data) ? r.data : (r.data?.data || []);
                setEmployees(list.filter(e => e.is_active !== false && e.status !== 'INACTIVE'));
            })
            .catch(() => setEmployees([]));
    }, [issued]);

    const empOptions = useMemo(() => employees.map(e => ({
        value: e.id ?? e.employee_id,
        label: e.name || e.employee_name || e.full_name || [e.first_name, e.last_name].filter(Boolean).join(' ') || `#${e.id ?? e.employee_id}`,
    })), [employees]);

    const issueFromStock = async () => {
        if (isKitSlip && !issuedTo) { setMsg({ kind: 'error', text: 'This is a kit slip with no default recipient — choose who receives the replacement.' }); return; }
        setBusy('stock');
        setMsg(null);
        try {
            const res = await trimLossApi.issueFromStock(caseData.id, issuedTo ? { issued_to_employee_id: issuedTo } : {});
            console.log('[trimloss] issueFromStock raw:', res.data);
            setMsg({ kind: 'success', text: `Replacement issued — slip ${res.data?.issue_number || ''} (${res.data?.qty ?? ''} pcs), stock deducted.` });
            if (onChanged) await onChanged();
        } catch (err) {
            const d = err.response?.data || {};
            if (d.available !== undefined) {
                setMsg({ kind: 'error', text: `Insufficient stock (only ${d.available} available). Use "Request purchase" to raise an urgent requirement instead.` });
            } else {
                setMsg({ kind: 'error', text: d.error || 'Failed to issue replacement from stock.' });
            }
        } finally {
            setBusy(null);
        }
    };

    const requestPurchase = async () => {
        setBusy('request');
        setMsg(null);
        try {
            const res = await trimLossApi.requestPurchase(caseData.id);
            console.log('[trimloss] requestPurchase raw:', res.data);
            setMsg({ kind: 'success', text: 'Purchase requested — factory & purchase heads notified for the 2nd approval.' });
            if (onChanged) await onChanged();
        } catch (err) {
            setMsg({ kind: 'error', text: err.response?.data?.error || 'Failed to request purchase.' });
        } finally {
            setBusy(null);
        }
    };

    const approvePurchase = async () => {
        setBusy('approve');
        setMsg(null);
        try {
            const res = await trimLossApi.approvePurchase(caseData.id);
            console.log('[trimloss] approvePurchase raw:', res.data);
            setMsg({ kind: 'success', text: `2nd approval done — URGENT purchase requirement raised${res.data?.requirement_id ? ` (#${res.data.requirement_id})` : ''}.` });
            if (onChanged) await onChanged();
        } catch (err) {
            const d = err.response?.data || {};
            if (err.response?.status === 403) {
                setMsg({ kind: 'error', text: d.error || 'The 2nd approval must be a different user than the requesting PM.' });
            } else {
                setMsg({ kind: 'error', text: d.error || 'Failed to approve purchase.' });
            }
        } finally {
            setBusy(null);
        }
    };

    // ── Already replaced ──
    if (issued) {
        return (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-100 flex items-center"><Repeat className="w-4 h-4 mr-2 text-indigo-600" /><h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider">Replacement</h3></div>
                <div className="p-5">
                    <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800 font-medium flex items-center">
                        <PackageCheck className="w-4 h-4 mr-2 shrink-0" />
                        Replacement issued on slip <span className="font-mono font-bold mx-1">{caseData.replacement_issue_number || `#${caseData.replacement_issue_id}`}</span>.
                    </div>
                </div>
            </div>
        );
    }

    if (!isPm && !isSecond) return null;

    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100">
                <div className="flex items-center"><Repeat className="w-4 h-4 mr-2 text-indigo-600" /><h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider">Replacement</h3></div>
                <p className="text-xs text-gray-400 font-medium mt-0.5">Issue the trim back to the line — from stock (single PM approval) or via an urgent purchase (double approval).</p>
            </div>
            <div className="p-5">
                <Banner msg={msg} onClose={() => setMsg(null)} />

                {/* Progress line for the purchase path */}
                {mode === 'PURCHASE' && (
                    <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
                        <span className={`px-2 py-1 rounded-full border font-bold ${pmApproved ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-50 text-gray-500 border-gray-200'}`}>1st approval (PM){caseData.replacement_pm_approved_at ? ` · ${fmtDateTime(caseData.replacement_pm_approved_at)}` : ''}</span>
                        <span className={`px-2 py-1 rounded-full border font-bold ${secondApproved ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-50 text-gray-500 border-gray-200'}`}>2nd approval{caseData.replacement_second_approved_at ? ` · ${fmtDateTime(caseData.replacement_second_approved_at)}` : ''}</span>
                        {requirementId && (
                            <Link to="/purchase-department/requirements?standalone=true" className="px-2 py-1 rounded-full border font-bold bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100">
                                Requirement #{requirementId}{caseData.replacement_requirement_status ? ` · ${caseData.replacement_requirement_status}` : ''}
                            </Link>
                        )}
                    </div>
                )}

                {/* In-stock issue — offered unless we're mid-purchase awaiting goods */}
                {(isPm) && (
                    <div className="mb-4 p-3 border border-gray-200 rounded-lg">
                        <p className="text-sm font-bold text-gray-800 mb-2 flex items-center"><PackageCheck className="w-4 h-4 mr-2 text-emerald-600" /> Issue from stock</p>
                        <div className="flex flex-col sm:flex-row sm:items-end gap-2">
                            <div className="flex-1">
                                <label className="text-[10px] uppercase tracking-wider font-bold text-gray-400">Issue to {isKitSlip ? <span className="text-rose-600">*</span> : <span className="normal-case font-medium">(defaults to original recipient)</span>}</label>
                                <SearchableSelect value={issuedTo} onChange={setIssuedTo} options={empOptions} placeholder="Choose employee…" accentColor="violet" />
                            </div>
                            <button onClick={issueFromStock} disabled={busy === 'stock'} className="flex items-center justify-center px-4 py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-bold hover:bg-emerald-700 disabled:opacity-50 shrink-0">
                                {busy === 'stock' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <PackageCheck className="w-4 h-4 mr-2" />} Issue replacement
                            </button>
                        </div>
                    </div>
                )}

                {/* Purchase path */}
                <div className="flex flex-wrap gap-2">
                    {isPm && mode !== 'PURCHASE' && (
                        <button onClick={requestPurchase} disabled={busy === 'request'} className="flex items-center px-4 py-2.5 bg-white text-indigo-600 border border-indigo-200 rounded-lg text-sm font-bold hover:bg-indigo-50 disabled:opacity-50">
                            {busy === 'request' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ShoppingCart className="w-4 h-4 mr-2" />} Out of stock — request purchase
                        </button>
                    )}
                    {isSecond && mode === 'PURCHASE' && pmApproved && !secondApproved && (
                        <button onClick={approvePurchase} disabled={busy === 'approve'} className="flex items-center px-4 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700 disabled:opacity-50">
                            {busy === 'approve' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Stamp className="w-4 h-4 mr-2" />} Approve purchase (2nd)
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ReplacementPanel;

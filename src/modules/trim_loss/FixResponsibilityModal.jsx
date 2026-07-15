import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { trimLossApi } from '../../api/trimLossApi';
import { hrApi } from '../../api/hrApi';
import SearchableSelect from '../../shared/SearchableSelect';
import { fmtMoney } from './format';
import { Loader2, X, Plus, Trash2, AlertTriangle, Scale, UserCheck } from 'lucide-react';

const outstandingQtyOf = (c) => {
    if (c.outstanding_qty != null) return Number(c.outstanding_qty);
    return Math.max(0, (Number(c.missing_qty) || 0) - (Number(c.found_qty) || 0));
};

// Fix responsibility — split the outstanding qty across employees (debit notes), or write off.
// Full-screen shell mirroring CreateExchangeModal.
const FixResponsibilityModal = ({ caseData, onClose, onDone }) => {
    const outstanding = outstandingQtyOf(caseData);
    const unitCost = Number(caseData.unit_cost) || 0;

    const [findings, setFindings] = useState(caseData.findings || '');
    const [writeOff, setWriteOff] = useState(false);
    const [rows, setRows] = useState([{ key: 1, employee_id: '', qty: '', reason: '' }]);
    const [nextKey, setNextKey] = useState(2);
    const [employees, setEmployees] = useState([]);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        hrApi.getAllEmployees()
            .then(r => {
                const list = Array.isArray(r.data) ? r.data : (r.data?.data || []);
                setEmployees(list.filter(e => e.is_active !== false && e.status !== 'INACTIVE'));
            })
            .catch(() => setEmployees([]));
    }, []);

    const empOptions = useMemo(() => employees.map(e => ({
        value: e.id ?? e.employee_id,
        label: e.name || e.employee_name || e.full_name || [e.first_name, e.last_name].filter(Boolean).join(' ') || `#${e.id ?? e.employee_id}`,
    })), [employees]);

    const addRow = () => { setRows(prev => [...prev, { key: nextKey, employee_id: '', qty: '', reason: '' }]); setNextKey(k => k + 1); };
    const removeRow = (key) => setRows(prev => prev.filter(r => r.key !== key));
    const setRow = (key, patch) => setRows(prev => prev.map(r => r.key === key ? { ...r, ...patch } : r));

    const sum = useMemo(() => rows.reduce((s, r) => s + (parseInt(r.qty, 10) || 0), 0), [rows]);
    const sumMatches = sum === outstanding;
    const allRowsValid = rows.every(r => r.employee_id && (parseInt(r.qty, 10) || 0) > 0);
    const noDupEmployee = new Set(rows.map(r => String(r.employee_id))).size === rows.length;

    const canSubmit = !submitting && findings.trim() && (
        writeOff
            ? true
            : (rows.length > 0 && allRowsValid && sumMatches && noDupEmployee)
    );

    const submit = async () => {
        if (!canSubmit) return;
        setSubmitting(true);
        setError(null);
        try {
            const payload = {
                findings: findings.trim(),
                write_off: writeOff,
                debits: writeOff ? [] : rows.map(r => ({ employee_id: r.employee_id, qty: parseInt(r.qty, 10), reason: r.reason.trim() || undefined })),
            };
            const res = await trimLossApi.fixResponsibility(caseData.id, payload);
            console.log('[trimloss] fixResponsibility raw:', res.data);
            onDone(res.data || {});
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to fix responsibility.');
            setSubmitting(false);
        }
    };

    return createPortal(
        <div className="fixed inset-0 bg-white z-[600] flex flex-col">
            {/* Top bar */}
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-indigo-100 rounded-lg"><Scale className="w-5 h-5 text-indigo-600" /></div>
                    <div>
                        <h2 className="text-lg font-extrabold text-gray-900">Fix responsibility — {caseData.case_number}</h2>
                        <p className="text-xs text-gray-500 font-medium">Split the outstanding {outstanding} pcs across employees, or write it off. Debit notes are raised on submit.</p>
                    </div>
                </div>
                <button onClick={() => !submitting && onClose()} className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg" title="Close"><X className="w-5 h-5" /></button>
            </div>

            {/* Body */}
            <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5">
                <div className="max-w-3xl mx-auto space-y-5">
                    <div>
                        <label className="text-[10px] uppercase tracking-wider font-bold text-gray-400">Findings <span className="text-rose-600">*</span></label>
                        <textarea
                            value={findings}
                            onChange={e => setFindings(e.target.value)}
                            rows={2}
                            placeholder="e.g. Loader kept custody of 2, operator had taken 3"
                            className="mt-1 w-full border border-gray-300 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                    </div>

                    <label className="flex items-center gap-2 p-3 bg-gray-50 border border-gray-200 rounded-lg cursor-pointer">
                        <input type="checkbox" checked={writeOff} onChange={e => setWriteOff(e.target.checked)} className="w-4 h-4 accent-indigo-600" />
                        <span className="text-sm font-semibold text-gray-800">Write off — the company absorbs the loss (no debit notes)</span>
                    </label>

                    {!writeOff && (
                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <h3 className="text-sm font-bold text-gray-700">Debit split</h3>
                                <span className={`text-xs font-bold px-2 py-1 rounded-full border ${sumMatches ? 'bg-green-50 text-green-700 border-green-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                                    {sum} / {outstanding} pcs allocated
                                </span>
                            </div>
                            <div className="space-y-2">
                                {rows.map(r => {
                                    const qn = parseInt(r.qty, 10) || 0;
                                    return (
                                        <div key={r.key} className="grid grid-cols-1 sm:grid-cols-[1fr_5rem_1fr_auto] gap-2 items-start bg-white border border-gray-200 rounded-lg p-3">
                                            <div>
                                                <label className="text-[10px] uppercase tracking-wider font-bold text-gray-400">Employee</label>
                                                <SearchableSelect
                                                    value={r.employee_id}
                                                    onChange={(v) => setRow(r.key, { employee_id: v })}
                                                    options={empOptions}
                                                    placeholder="Choose employee…"
                                                    accentColor="violet"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-[10px] uppercase tracking-wider font-bold text-gray-400">Qty</label>
                                                <input
                                                    type="number" min="1" step="1"
                                                    value={r.qty}
                                                    onChange={e => setRow(r.key, { qty: e.target.value })}
                                                    onWheel={e => e.target.blur()}
                                                    className="mt-1 w-full border border-gray-300 rounded-lg p-2 text-center text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-[10px] uppercase tracking-wider font-bold text-gray-400">Reason</label>
                                                <input
                                                    type="text"
                                                    value={r.reason}
                                                    onChange={e => setRow(r.key, { reason: e.target.value })}
                                                    placeholder="e.g. custody not transferred"
                                                    className="mt-1 w-full border border-gray-300 rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                                                />
                                                {qn > 0 && unitCost > 0 && <p className="text-[11px] text-gray-500 mt-1">Amount: <span className="font-mono font-bold">{fmtMoney(qn * unitCost)}</span></p>}
                                            </div>
                                            <button onClick={() => removeRow(r.key)} disabled={rows.length === 1} className="mt-5 text-gray-400 hover:text-red-600 p-1 disabled:opacity-30"><Trash2 className="w-4 h-4" /></button>
                                        </div>
                                    );
                                })}
                            </div>
                            <button onClick={addRow} className="mt-2 flex items-center text-sm font-bold text-indigo-600 hover:text-indigo-700">
                                <Plus className="w-4 h-4 mr-1" /> Add employee
                            </button>
                            {!sumMatches && <p className="text-xs font-bold text-amber-600 mt-2">The split must total exactly {outstanding} pcs (currently {sum}).</p>}
                            {!noDupEmployee && <p className="text-xs font-bold text-red-600 mt-1">Each employee can appear only once.</p>}
                        </div>
                    )}
                </div>
            </div>

            {/* Footer */}
            <div className="border-t border-gray-200 shrink-0">
                {error && (
                    <div className="mx-6 mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 font-medium flex items-start">
                        <AlertTriangle className="w-4 h-4 mr-2 shrink-0 mt-0.5" /> {error}
                    </div>
                )}
                <div className="px-6 py-4 flex items-center justify-end gap-2">
                    <button onClick={onClose} disabled={submitting} className="px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg font-bold text-sm hover:bg-gray-200 disabled:opacity-50">Cancel</button>
                    <button onClick={submit} disabled={!canSubmit} className="px-5 py-2.5 bg-indigo-600 text-white rounded-lg font-bold text-sm hover:bg-indigo-700 disabled:opacity-50 flex items-center">
                        {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <UserCheck className="w-4 h-4 mr-2" />}
                        {writeOff ? 'Write off loss' : 'Raise debit notes'}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default FixResponsibilityModal;

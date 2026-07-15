import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Modal from '../../shared/Modal';
import { trimLossApi } from '../../api/trimLossApi';
import { variantText } from './format';
import { Loader2, PackageX, AlertTriangle, CheckCircle2 } from 'lucide-react';

// SOP search checklist shown to the loader after a case is reported.
export const SEARCH_CHECKLIST = [
    'the line itself (workstations, under tables)',
    'trolleys and bins around the line',
    'cartons / poly bags at the line',
    'the store receiving area',
    'previous batch kits still on the floor',
];

// Report a missing/lost trim off a signed slip line. Prefilled from the line + slip header.
// `line` needs trim_item_variant_id (added by the backend to GET /trim-kits/history/:issueId).
// `header` provides original_issue_id, production_line_id (delivery_line_id) and production_batch_id.
const ReportMissingModal = ({ line, header, onClose, onCreated }) => {
    const navigate = useNavigate();
    const maxQty = Number(line?.qty) || 0;
    const variantId = line?.trim_item_variant_id ?? line?.variant_id ?? line?.trim_item_variant?.id;

    const [missingQty, setMissingQty] = useState(String(maxQty || 1));
    const [notes, setNotes] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState(null);
    const [created, setCreated] = useState(null); // server response after success

    const qtyNum = parseInt(missingQty, 10);
    const qtyValid = Number.isInteger(qtyNum) && qtyNum > 0 && (!maxQty || qtyNum <= maxQty);
    const canSubmit = variantId != null && qtyValid && !submitting;

    const submit = async () => {
        if (!canSubmit) return;
        setSubmitting(true);
        setError(null);
        try {
            const payload = {
                trim_item_variant_id: variantId,
                missing_qty: qtyNum,
                original_issue_id: header?.issue_id ?? header?.original_issue_id,
                production_line_id: header?.delivery_line_id ?? header?.delivery_production_line_id ?? undefined,
                production_batch_id: header?.production_batch_id ?? undefined,
                notes: notes.trim() || undefined,
            };
            const res = await trimLossApi.reportCase(payload);
            console.log('[trimloss] reportCase raw:', res.data);
            setCreated(res.data);
            if (onCreated) onCreated(res.data);
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to report missing trim.');
        } finally {
            setSubmitting(false);
        }
    };

    if (created) {
        const caseId = created.id;
        return (
            <Modal title="Case reported" onClose={onClose}>
                <div className="space-y-4">
                    <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800 font-medium flex items-start">
                        <CheckCircle2 className="w-4 h-4 mr-2 shrink-0 mt-0.5" />
                        {created.case_number || 'Case'} created. {created.message || ''}
                    </div>
                    <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                        <p className="text-xs font-bold uppercase tracking-wider text-amber-700 mb-2">Search now — within the shift</p>
                        <ul className="list-disc list-inside space-y-1 text-sm text-gray-700">
                            {SEARCH_CHECKLIST.map((s, i) => <li key={i}>{s}</li>)}
                        </ul>
                        <p className="text-xs text-gray-500 mt-2">Then open the case and record the search outcome (found / not found).</p>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={onClose} className="flex-1 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg font-bold text-sm hover:bg-gray-200">Close</button>
                        {caseId != null && (
                            <button onClick={() => navigate(`/trim-loss/cases/${caseId}`)} className="flex-1 px-4 py-2.5 bg-indigo-600 text-white rounded-lg font-bold text-sm hover:bg-indigo-700">Open case</button>
                        )}
                    </div>
                </div>
            </Modal>
        );
    }

    return (
        <Modal title="Report missing / lost trim" onClose={onClose}>
            <div className="space-y-4">
                <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
                    <div className="flex items-center gap-2">
                        <PackageX className="w-4 h-4 text-red-600 shrink-0" />
                        <p className="text-sm font-semibold text-gray-800">{line?.item_name}{variantText(line) ? ` — ${variantText(line)}` : ''}</p>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                        On slip {header?.issue_number || `#${header?.issue_id}`}
                        {maxQty ? ` · ${maxQty} issued` : ''}
                        {header?.delivery_line_name ? ` · ${header.delivery_line_name}` : ''}
                    </p>
                </div>

                {variantId == null && (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800 font-medium flex items-start">
                        <AlertTriangle className="w-4 h-4 mr-2 shrink-0 mt-0.5" />
                        This line has no trim variant id yet — reporting is unavailable until the backend provides it.
                    </div>
                )}

                <div>
                    <label className="text-[10px] uppercase tracking-wider font-bold text-gray-400">Missing quantity {maxQty ? <span className="text-gray-400 font-medium normal-case">(max {maxQty})</span> : ''}</label>
                    <input
                        type="number"
                        min="1"
                        max={maxQty || undefined}
                        step="1"
                        value={missingQty}
                        onChange={e => setMissingQty(e.target.value)}
                        onWheel={e => e.target.blur()}
                        className={`mt-1 w-32 border rounded-lg p-2.5 text-center font-bold text-sm outline-none focus:ring-2 ${qtyValid || !missingQty ? 'border-gray-300 focus:ring-indigo-500' : 'border-red-400 bg-red-50 text-red-700 focus:ring-red-400'}`}
                    />
                    {!qtyValid && missingQty !== '' && <p className="text-xs text-red-600 mt-1 font-medium">Enter a whole number between 1 and {maxQty || '∞'}.</p>}
                </div>

                <div>
                    <label className="text-[10px] uppercase tracking-wider font-bold text-gray-400">Notes (optional)</label>
                    <textarea
                        value={notes}
                        onChange={e => setNotes(e.target.value)}
                        rows={2}
                        placeholder="e.g. missing at line loading"
                        className="mt-1 w-full border border-gray-300 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                </div>

                {error && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 font-medium flex items-start">
                        <AlertTriangle className="w-4 h-4 mr-2 shrink-0 mt-0.5" /> {error}
                    </div>
                )}

                <div className="flex gap-2">
                    <button onClick={onClose} disabled={submitting} className="flex-1 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg font-bold text-sm hover:bg-gray-200 disabled:opacity-50">Cancel</button>
                    <button onClick={submit} disabled={!canSubmit} className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-lg font-bold text-sm hover:bg-red-700 disabled:opacity-50 flex items-center justify-center">
                        {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <PackageX className="w-4 h-4 mr-2" />}
                        Report case
                    </button>
                </div>
            </div>
        </Modal>
    );
};

export default ReportMissingModal;

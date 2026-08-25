import React, { useState, useEffect, useMemo } from 'react';
import { finalQcApi } from '../../api/finalQcApi';
import { qcApi } from '../../api/qcApi';
import { dispatchManagerApi } from '../../api/dispatchManagerApi';
import { SEVERITY_OPTIONS, severityOf, previewResult } from './finalQcStatusConfig';
import { Loader2, X, Plus, Trash2, AlertTriangle, CheckCircle2, Search } from 'lucide-react';

const genKey = () => `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
const freshDefect = () => ({ _key: genKey(), defect_code_id: '', severity: 'MINOR', quantity: '1', unit_identifier: '', responsible_operator_id: '', notes: '' });

// Create screen for a Final QC (pre-dispatch AQL) inspection. A single atomic
// POST returns the tallied PASS/FAIL result immediately — there's no "in
// progress" state to poll.
const CreateFinalQcInspectionModal = ({ initialBatchId = null, onClose, onCreated }) => {
    const [batchId,   setBatchId]   = useState(initialBatchId ? String(initialBatchId) : '');
    const [batchInfo, setBatchInfo] = useState(null);
    const [batchLookupErr, setBatchLookupErr] = useState(null);
    const [lookingUp, setLookingUp] = useState(false);

    const [packingListId, setPackingListId] = useState('');
    const [lotSize,      setLotSize]      = useState('');
    const [aqlLevel,     setAqlLevel]     = useState('II');
    const [sampleSize,   setSampleSize]   = useState('');
    const [majorLimit,   setMajorLimit]   = useState('0');
    const [minorLimit,   setMinorLimit]   = useState('0');
    const [notes,        setNotes]        = useState('');
    const [defects,      setDefects]      = useState([freshDefect()]);

    const [defectCodes, setDefectCodes] = useState([]);
    const [submitting,  setSubmitting]  = useState(false);
    const [error,       setError]       = useState(null);

    useEffect(() => {
        qcApi.getAllDefectCodes()
            .then(res => {
                const rows = (res.data || []).filter(c => c.is_active);
                // PACKING codes first — the natural choice for this screen — but any
                // active code is legal (a final inspection can catch earlier defects too).
                rows.sort((a, b) => {
                    if (a.category === 'PACKING' && b.category !== 'PACKING') return -1;
                    if (b.category === 'PACKING' && a.category !== 'PACKING') return 1;
                    return (a.category || '').localeCompare(b.category || '') || (a.code || '').localeCompare(b.code || '');
                });
                setDefectCodes(rows);
            })
            .catch(() => setDefectCodes([]));
    }, []);

    const lookupBatch = async () => {
        if (!batchId) return;
        setLookingUp(true);
        setBatchLookupErr(null);
        setBatchInfo(null);
        try {
            const res = await dispatchManagerApi.getBatchDetail(batchId);
            const batch = res.data?.batch || res.data?.data?.batch;
            if (!batch) throw new Error('not found');
            setBatchInfo(batch);
        } catch {
            setBatchLookupErr('Could not find a batch with that ID.');
        } finally {
            setLookingUp(false);
        }
    };

    const updateDefect = (idx, field, val) => {
        setDefects(prev => prev.map((d, i) => i === idx ? { ...d, [field]: val } : d));
    };
    const addDefect = () => setDefects(prev => [...prev, freshDefect()]);
    const removeDefect = (idx) => setDefects(prev => prev.filter((_, i) => i !== idx));

    const preview = useMemo(() => previewResult(defects.filter(d => d.defect_code_id), majorLimit, minorLimit), [defects, majorLimit, minorLimit]);

    const canSubmit = batchId && Number(lotSize) > 0 && Number(sampleSize) > 0 &&
        defects.every(d => !d.defect_code_id || (SEVERITY_OPTIONS.includes(d.severity) && Number(d.quantity) > 0));

    const handleSubmit = async () => {
        setSubmitting(true);
        setError(null);
        try {
            const payload = {
                production_batch_id: parseInt(batchId, 10),
                packing_list_id: packingListId ? parseInt(packingListId, 10) : null,
                lot_size: parseInt(lotSize, 10),
                aql_level: aqlLevel,
                sample_size: parseInt(sampleSize, 10),
                major_defect_limit: parseInt(majorLimit, 10) || 0,
                minor_defect_limit: parseInt(minorLimit, 10) || 0,
                defects: defects
                    .filter(d => d.defect_code_id)
                    .map(d => ({
                        defect_code_id: parseInt(d.defect_code_id, 10),
                        severity: d.severity,
                        quantity: parseInt(d.quantity, 10) || 1,
                        unit_identifier: d.unit_identifier.trim() || undefined,
                        responsible_operator_id: d.responsible_operator_id ? parseInt(d.responsible_operator_id, 10) : null,
                        notes: d.notes.trim() || undefined,
                    })),
                previous_inspection_id: null,
                notes: notes.trim() || undefined,
            };
            const res = await finalQcApi.createInspection(payload);
            onCreated?.(res.data);
        } catch (e) {
            setError(e?.response?.data?.error || 'Failed to record inspection.');
            setSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={!submitting ? onClose : undefined}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
                <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-gray-100 shrink-0">
                    <div>
                        <h2 className="text-lg font-black text-gray-900">New Final QC Inspection</h2>
                        <p className="text-xs text-gray-500 mt-0.5">Pre-dispatch AQL check — one atomic record, result computed on save.</p>
                    </div>
                    {!submitting && (
                        <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-full transition shrink-0">
                            <X size={16} className="text-gray-500" />
                        </button>
                    )}
                </div>

                <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
                    {error && (
                        <div className="p-3 bg-red-50 text-red-700 rounded-lg border border-red-200 flex items-center text-sm font-medium">
                            <AlertTriangle className="h-4 w-4 mr-2 shrink-0" /> {error}
                        </div>
                    )}

                    {/* Batch */}
                    <div>
                        <label className="text-[10px] uppercase tracking-wider font-bold text-gray-400">Production Batch ID</label>
                        <div className="flex gap-2 mt-1">
                            <input
                                type="number" value={batchId}
                                onChange={e => { setBatchId(e.target.value); setBatchInfo(null); setBatchLookupErr(null); }}
                                onBlur={lookupBatch}
                                placeholder="e.g. 172"
                                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                            <button type="button" onClick={lookupBatch} disabled={!batchId || lookingUp}
                                className="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-600 disabled:opacity-50 shrink-0">
                                {lookingUp ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
                            </button>
                        </div>
                        {batchInfo && (
                            <p className="text-xs text-emerald-700 mt-1.5 flex items-center gap-1">
                                <CheckCircle2 size={12} /> {batchInfo.batch_code} — {batchInfo.product_name} · {batchInfo.customer_name}
                            </p>
                        )}
                        {batchLookupErr && <p className="text-xs text-red-600 mt-1.5">{batchLookupErr}</p>}
                    </div>

                    {/* AQL parameters */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        <div>
                            <label className="text-[10px] uppercase tracking-wider font-bold text-gray-400">Lot Size</label>
                            <input type="number" min="1" value={lotSize} onChange={e => setLotSize(e.target.value)}
                                className="w-full mt-1 border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
                        </div>
                        <div>
                            <label className="text-[10px] uppercase tracking-wider font-bold text-gray-400">AQL Level</label>
                            <input type="text" value={aqlLevel} onChange={e => setAqlLevel(e.target.value)}
                                placeholder="II"
                                className="w-full mt-1 border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
                        </div>
                        <div>
                            <label className="text-[10px] uppercase tracking-wider font-bold text-gray-400">Sample Size</label>
                            <input type="number" min="1" value={sampleSize} onChange={e => setSampleSize(e.target.value)}
                                className="w-full mt-1 border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
                        </div>
                        <div>
                            <label className="text-[10px] uppercase tracking-wider font-bold text-gray-400">Major Defect Limit</label>
                            <input type="number" min="0" value={majorLimit} onChange={e => setMajorLimit(e.target.value)}
                                className="w-full mt-1 border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
                        </div>
                        <div>
                            <label className="text-[10px] uppercase tracking-wider font-bold text-gray-400">Minor Defect Limit</label>
                            <input type="number" min="0" value={minorLimit} onChange={e => setMinorLimit(e.target.value)}
                                className="w-full mt-1 border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
                        </div>
                        <div>
                            <label className="text-[10px] uppercase tracking-wider font-bold text-gray-400">Packing List ID <span className="normal-case font-medium text-gray-300">(optional)</span></label>
                            <input type="number" min="1" value={packingListId} onChange={e => setPackingListId(e.target.value)}
                                className="w-full mt-1 border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
                        </div>
                    </div>
                    <p className="text-[11px] text-gray-400 -mt-2">
                        AQL chart lookup isn't automated yet — fill sample size / limits from your paper AQL 2.5 reference.
                    </p>

                    {/* Defect lines */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <label className="text-[10px] uppercase tracking-wider font-bold text-gray-400">Defect Lines <span className="normal-case font-medium text-gray-300">(leave empty for a clean-sample pass)</span></label>
                            <button type="button" onClick={addDefect} className="flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-700">
                                <Plus size={13} /> Add line
                            </button>
                        </div>
                        <div className="space-y-2">
                            {defects.map((d, idx) => (
                                <div key={d._key} className="border border-gray-200 rounded-lg p-3 space-y-2">
                                    <div className="flex items-center gap-2">
                                        <select value={d.defect_code_id} onChange={e => updateDefect(idx, 'defect_code_id', e.target.value)}
                                            className="flex-1 border border-gray-300 rounded-lg px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
                                            <option value="">— Defect code —</option>
                                            {defectCodes.map(c => (
                                                <option key={c.id} value={c.id}>{c.category} · {c.code} — {c.description}</option>
                                            ))}
                                        </select>
                                        <select value={d.severity} onChange={e => updateDefect(idx, 'severity', e.target.value)}
                                            className="w-32 border border-gray-300 rounded-lg px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
                                            {SEVERITY_OPTIONS.map(s => <option key={s} value={s}>{severityOf(s).label}</option>)}
                                        </select>
                                        <input type="number" min="1" value={d.quantity} onChange={e => updateDefect(idx, 'quantity', e.target.value)}
                                            className="w-16 border border-gray-300 rounded-lg px-2 py-1.5 text-xs text-right outline-none focus:ring-2 focus:ring-indigo-500" />
                                        <button type="button" onClick={() => removeDefect(idx)} className="text-gray-300 hover:text-red-500 shrink-0">
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <input type="text" value={d.unit_identifier} onChange={e => updateDefect(idx, 'unit_identifier', e.target.value)}
                                            placeholder="Unit identifier (optional)"
                                            className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-indigo-300" />
                                        <input type="text" value={d.notes} onChange={e => updateDefect(idx, 'notes', e.target.value)}
                                            placeholder="Notes (optional)"
                                            className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-indigo-300" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Live preview */}
                    <div className={`rounded-lg border px-4 py-3 flex items-center justify-between ${preview.result === 'FAIL' ? 'bg-red-50 border-red-200' : 'bg-emerald-50 border-emerald-200'}`}>
                        <div className="text-xs text-gray-600">
                            Critical <strong>{preview.criticalCount}</strong> · Major <strong>{preview.majorCount}</strong>/{majorLimit || 0} · Minor <strong>{preview.minorCount}</strong>/{minorLimit || 0}
                        </div>
                        <span className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider ${preview.result === 'FAIL' ? 'bg-red-600 text-white' : 'bg-emerald-600 text-white'}`}>
                            Preview: {preview.result}
                        </span>
                    </div>
                    <p className="text-[10px] text-gray-400 -mt-2">This is a client-side preview only — the server computes and returns the authoritative result.</p>

                    <div>
                        <label className="text-[10px] uppercase tracking-wider font-bold text-gray-400">Overall Notes <span className="normal-case font-medium text-gray-300">(optional)</span></label>
                        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                            className="w-full mt-1 border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
                    </div>
                </div>

                <div className="flex justify-end gap-2 px-5 py-3 border-t border-gray-100 shrink-0">
                    <button onClick={onClose} disabled={submitting}
                        className="text-sm font-medium text-gray-500 hover:text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-100 transition disabled:opacity-40">
                        Cancel
                    </button>
                    <button onClick={handleSubmit} disabled={submitting || !canSubmit}
                        className="flex items-center gap-2 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed px-5 py-2 rounded-lg transition shadow-sm">
                        {submitting ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
                        Record Inspection
                    </button>
                </div>
            </div>
        </div>
    );
};

export default CreateFinalQcInspectionModal;

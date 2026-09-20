// ─── CREATE RETURN NOTE MODAL ────────────────────────────────────────────────
// Reviews the rolls selected on the All Rolls tab, blocks mixed-supplier
// selections outright (a return note is one physical document to one
// supplier — rather than silently splitting into several notes behind the
// user's back), collects a required reason, submits, then immediately
// downloads the generated PDF. Whole-roll, immediate effect, no approval step
// — see fabricStoreController.js's createFabricReturnNote.

import { useState } from 'react';
import { X, AlertTriangle, Loader2, Undo2 } from 'lucide-react';
import { fabricStoreApi } from '../../../api/fabricStoreApi';
import { adminApi } from '../../../api/adminApi';
import { downloadFabricReturnNotePdf } from '../../purchase_department/fabricReturnNotePdfGenerator';

const fmt = (n, d = 2) => Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: d });

const CreateReturnNoteModal = ({ rolls, onClose, onCreated }) => {
    const [reason,     setReason]     = useState('');
    const [notes,      setNotes]      = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [err,        setErr]        = useState(null);

    const supplierIds = [...new Set(rolls.map(r => r.supplier_id))];
    const mixedSupplier = supplierIds.length > 1;
    const totalMeters = rolls.reduce((s, r) => s + parseFloat(r.meter || 0), 0);
    const poCodesUsed = [...new Set(rolls.map(r => r.po_code).filter(Boolean))];

    const handleSubmit = async () => {
        if (!reason.trim()) { setErr('A reason is required.'); return; }
        setSubmitting(true);
        setErr(null);
        try {
            const res = await fabricStoreApi.createReturnNote({
                roll_ids: rolls.map(r => r.roll_id),
                reason: reason.trim(),
                notes: notes.trim() || undefined,
            });
            const created = res.data;

            let company = null;
            try {
                const cr = await adminApi.getCompanyProfile();
                company = cr?.data?.data ?? cr?.data ?? null;
            } catch { /* proceed without company header */ }

            const returnNote = {
                ...created,
                supplier_name: rolls[0].supplier_name,
                po_code: poCodesUsed.length === 1 ? poCodesUsed[0] : null,
                items: rolls.map(r => ({
                    fabric_roll_id: r.roll_id,
                    bale_no: r.bale_no,
                    fabric_type_name: r.fabric_type,
                    fabric_color_name: r.fabric_color,
                    color_number: r.color_number,
                    meter: r.meter,
                    uom: r.uom,
                })),
            };
            await downloadFabricReturnNotePdf({ returnNote, company });

            onCreated();
        } catch (e) {
            setErr(e?.response?.data?.error || e.message || 'Failed to create return note.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                    <h3 className="text-sm font-extrabold text-slate-800 flex items-center gap-2">
                        <Undo2 size={16} className="text-rose-600" /> Create Return Note
                    </h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
                        <X size={18} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                    {mixedSupplier ? (
                        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
                            <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                            <div>
                                <p className="font-bold">Selected rolls belong to more than one supplier.</p>
                                <p className="mt-1 text-xs text-red-600">
                                    A return note goes to one supplier. Remove rolls until only one supplier remains, or create separate return notes per supplier.
                                </p>
                            </div>
                        </div>
                    ) : (
                        <>
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-slate-500">Supplier</span>
                                <span className="font-bold text-slate-800">{rolls[0]?.supplier_name || '—'}</span>
                            </div>

                            <div className="border border-slate-200 rounded-xl overflow-hidden">
                                <table className="w-full text-xs">
                                    <thead className="bg-slate-50 border-b border-slate-100">
                                        <tr>
                                            <th className="text-left px-3 py-2 text-[9px] font-bold text-slate-400 uppercase">Roll</th>
                                            <th className="text-left px-3 py-2 text-[9px] font-bold text-slate-400 uppercase">Bale No.</th>
                                            <th className="text-left px-3 py-2 text-[9px] font-bold text-slate-400 uppercase">Type / Colour</th>
                                            <th className="text-right px-3 py-2 text-[9px] font-bold text-slate-400 uppercase">Meters</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                        {rolls.map(r => (
                                            <tr key={r.roll_id}>
                                                <td className="px-3 py-2 font-mono font-bold text-indigo-600">R-{r.roll_id}</td>
                                                <td className="px-3 py-2 font-mono text-slate-600">{r.bale_no || '—'}</td>
                                                <td className="px-3 py-2 text-slate-600">
                                                    {r.fabric_type} · {r.fabric_color}{r.color_number ? ` (${r.color_number})` : ''}
                                                </td>
                                                <td className="px-3 py-2 text-right font-bold text-slate-800">{fmt(r.meter)} {r.uom}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    <tfoot className="bg-slate-50 border-t border-slate-200">
                                        <tr>
                                            <td colSpan={3} className="px-3 py-2 text-right font-bold text-slate-500 text-[10px] uppercase">Total</td>
                                            <td className="px-3 py-2 text-right font-extrabold text-slate-800">{fmt(totalMeters)} m</td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>

                            <div>
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Reason *</label>
                                <textarea
                                    value={reason}
                                    onChange={e => setReason(e.target.value)}
                                    rows={2}
                                    placeholder="e.g. Shade mismatch against approved sample"
                                    className="w-full mt-1 text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-rose-400"
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Notes (optional)</label>
                                <textarea
                                    value={notes}
                                    onChange={e => setNotes(e.target.value)}
                                    rows={2}
                                    className="w-full mt-1 text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-rose-400"
                                />
                            </div>
                        </>
                    )}

                    {err && (
                        <div className="flex items-center gap-2 bg-red-50 border border-red-100 rounded-lg px-3 py-2 text-xs text-red-600">
                            <AlertTriangle size={13} /> {err}
                        </div>
                    )}
                </div>

                <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-100">
                    <button onClick={onClose} disabled={submitting}
                        className="text-sm font-bold text-slate-500 hover:text-slate-700 px-4 py-2 rounded-lg hover:bg-slate-100 disabled:opacity-40">
                        Cancel
                    </button>
                    {!mixedSupplier && (
                        <button
                            onClick={handleSubmit}
                            disabled={submitting || !reason.trim()}
                            className="flex items-center gap-1.5 text-sm font-bold text-white bg-rose-600 hover:bg-rose-700 px-4 py-2 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            {submitting ? <Loader2 size={14} className="animate-spin" /> : <Undo2 size={14} />}
                            Create &amp; Download
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default CreateReturnNoteModal;

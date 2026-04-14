import React, { useState, useEffect, useCallback } from 'react';
import { productionManagerApi } from '../../api/productionManagerApi';
import {
    LuRefreshCw, LuSave, LuUsers, LuPackage,
    LuCircleAlert, LuCircleCheck, LuCalendar, LuTarget, LuX, LuClock,
} from 'react-icons/lu';

// ──────────────────────────────────────────────────────────────
// Key helpers
// ──────────────────────────────────────────────────────────────

/** PIECE targets are keyed per line + part (not per batch) */
const tKeyPiece = (lineId, partId) => `P_${lineId}_${partId}`;

/** GARMENT targets are keyed per line only (one daily total, saved against primary batch) */
const tKeyGarment = (lineId) => `G_${lineId}`;

// ──────────────────────────────────────────────────────────────
// Data helpers
// ──────────────────────────────────────────────────────────────

/**
 * Deduplicate piece parts across all batches on a line.
 * Take existing_quantity from whichever batch already has a saved target.
 */
function getUniquePartsForLine(line) {
    const seen = new Map(); // part_id → part object
    for (const batch of line.batches) {
        for (const part of batch.piece_parts ?? []) {
            if (!seen.has(part.part_id)) {
                seen.set(part.part_id, { ...part });
            } else if (parseInt(part.existing_quantity) > 0) {
                // Prefer the entry that already has a saved target
                seen.get(part.part_id).existing_quantity = part.existing_quantity;
                seen.get(part.part_id).target_id = part.target_id;
            }
        }
    }
    return Array.from(seen.values());
}

/** Primary batch to associate PIECE targets with when saving */
function getPrimaryBatch(line) {
    return (
        line.batches.find(b => b.batch_status === 'IN_PROGRESS') ??
        line.batches.find(b => b.batch_status === 'PENDING') ??
        line.batches[0] ??
        null
    );
}

/** Build the initial targets map from loaded form data */
function buildInitialTargets(lines) {
    const init = {};
    for (const line of lines) {
        if (line.target_type === 'SKIP') continue;

        if (line.target_type === 'PIECE') {
            const parts = getUniquePartsForLine(line);
            for (const part of parts) {
                const qty = parseInt(part.existing_quantity) || 0;
                init[tKeyPiece(line.line_id, part.part_id)] = qty > 0 ? String(qty) : '';
            }
        } else if (line.target_type === 'GARMENT') {
            // One target per line — take the first non-zero existing_quantity across batches
            let existingQty = 0;
            for (const batch of line.batches) {
                const qty = parseInt(batch.garment_target?.existing_quantity) || 0;
                if (qty > 0) { existingQty = qty; break; }
            }
            init[tKeyGarment(line.line_id)] = existingQty > 0 ? String(existingQty) : '';
        }
    }
    return init;
}

// ──────────────────────────────────────────────────────────────
// Style helpers
// ──────────────────────────────────────────────────────────────

function mpChipStyle(present, assigned) {
    if (assigned === 0) return 'bg-gray-100 text-gray-500 border-gray-200';
    const ratio = present / assigned;
    if (ratio >= 0.9) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    if (ratio >= 0.7) return 'bg-amber-50 text-amber-700 border-amber-200';
    return 'bg-red-50 text-red-700 border-red-200';
}

const TARGET_TYPE_BADGE = {
    PIECE:   'bg-blue-100 text-blue-700',
    GARMENT: 'bg-purple-100 text-purple-700',
    SKIP:    'bg-gray-100 text-gray-500',
};


const PART_TYPE_BADGE = {
    PRIMARY:    'bg-blue-50 text-blue-600',
    SUPPORTING: 'bg-gray-100 text-gray-500',
};

// ──────────────────────────────────────────────────────────────
// Employee Modal
// ──────────────────────────────────────────────────────────────

function EmployeeModal({ line, onClose }) {
    const employees = line.employees_assigned ?? [];
    const present   = employees.filter(e => e.is_present);
    const absent    = employees.filter(e => !e.is_present);

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            onClick={onClose}
        >
            <div
                className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col"
                onClick={e => e.stopPropagation()}
            >
                {/* Modal header */}
                <div className="flex items-start justify-between px-5 pt-5 pb-4 border-b border-gray-100">
                    <div>
                        <h2 className="font-bold text-gray-800">{line.line_name}</h2>
                        <p className="text-xs text-gray-400 mt-0.5">
                            {present.length} present · {absent.length} absent · {employees.length} assigned
                        </p>
                    </div>
                    <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
                        <LuX size={18} />
                    </button>
                </div>

                {/* Employee list */}
                <div className="overflow-y-auto flex-1 px-5 py-3 space-y-4">

                    {present.length > 0 && (
                        <div>
                            <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wide mb-2">
                                Present ({present.length})
                            </p>
                            <div className="space-y-1">
                                {present.map(emp => (
                                    <div key={emp.emp_id} className="flex items-center justify-between py-2 border-b border-gray-50">
                                        <div className="flex items-center gap-2">
                                            <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center text-xs font-bold text-emerald-700">
                                                {emp.name.charAt(0)}
                                            </div>
                                            <span className="text-sm text-gray-700">{emp.name}</span>
                                        </div>
                                        {emp.punch_in && (
                                            <div className="flex items-center gap-1 text-xs text-gray-400">
                                                <LuClock size={11} />
                                                <span>{emp.punch_in}</span>
                                                {emp.punch_out && <><span>–</span><span>{emp.punch_out}</span></>}
                                                {!emp.punch_out && <span className="text-amber-500">(in)</span>}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {absent.length > 0 && (
                        <div>
                            <p className="text-xs font-semibold text-red-500 uppercase tracking-wide mb-2">
                                Absent ({absent.length})
                            </p>
                            <div className="space-y-1">
                                {absent.map(emp => (
                                    <div key={emp.emp_id} className="flex items-center py-2 border-b border-gray-50">
                                        <div className="w-6 h-6 rounded-full bg-red-50 flex items-center justify-center text-xs font-bold text-red-400 mr-2">
                                            {emp.name.charAt(0)}
                                        </div>
                                        <span className="text-sm text-gray-400">{emp.name}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {employees.length === 0 && (
                        <p className="text-sm text-gray-400 text-center py-6">No employees assigned to this line.</p>
                    )}
                </div>
            </div>
        </div>
    );
}

// ──────────────────────────────────────────────────────────────
// Qty input
// ──────────────────────────────────────────────────────────────

function QtyInput({ value, onChange }) {
    return (
        <input
            type="number"
            min="1"
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder="—"
            className="w-28 text-right border border-gray-200 rounded-lg px-3 py-1.5 text-sm
                       focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                       placeholder-gray-300"
        />
    );
}

// ──────────────────────────────────────────────────────────────
// Line card
// ──────────────────────────────────────────────────────────────

function LineCard({ line, targets, onQtyChange, onManpowerClick }) {
    const present  = line.manpower_present  ?? 0;
    const assigned = line.manpower_assigned ?? 0;
    const chipCls  = mpChipStyle(present, assigned);

    const uniqueParts   = line.target_type === 'PIECE' ? getUniquePartsForLine(line) : [];
    const activeBatches = line.batches.filter(b => b.batch_status === 'IN_PROGRESS');
    const pendingBatches = line.batches.filter(b => b.batch_status === 'PENDING');

    return (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-4 overflow-hidden">

            {/* ── Line header ── */}
            <div className="flex items-center justify-between px-5 py-3.5 bg-gray-50 border-b border-gray-100">
                <div className="flex items-center gap-3 min-w-0">
                    <h2 className="font-semibold text-gray-800 truncate">{line.line_name}</h2>
                    <span className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${TARGET_TYPE_BADGE[line.target_type]}`}>
                        {line.target_type}
                    </span>
                    <span className="text-xs text-gray-400 hidden sm:inline shrink-0">{line.processing_mode}</span>
                </div>

                {/* Clickable manpower chip */}
                <button
                    onClick={() => onManpowerClick(line)}
                    title="Click to see employee details"
                    className={`flex items-center gap-1.5 text-sm px-2.5 py-1 rounded-lg border cursor-pointer
                                hover:opacity-80 transition-opacity ${chipCls}`}
                >
                    <LuUsers size={13} />
                    <span className="font-semibold">{present}</span>
                    <span className="opacity-60">/ {assigned}</span>
                    <span className="text-xs opacity-60 hidden sm:inline">present</span>
                </button>
            </div>

            {/* ── SKIP ── */}
            {line.target_type === 'SKIP' && (
                <div className="px-5 py-4 text-sm text-gray-400 italic">
                    Targets are not tracked for this line type.
                </div>
            )}

            {/* ── No batches ── */}
            {line.target_type !== 'SKIP' && line.batches.length === 0 && (
                <div className="px-5 py-4 text-sm text-gray-400 italic">
                    No active or pending batches assigned to this line.
                </div>
            )}

            {/* ── PIECE: one target table per line, batch list as context ── */}
            {line.target_type === 'PIECE' && line.batches.length > 0 && (
                <div className="px-5 py-4">
                    {/* Active/pending batch pills for context */}
                    <div className="flex flex-wrap gap-1.5 mb-4">
                        {activeBatches.map(b => (
                            <span key={b.batch_id} className="inline-flex items-center gap-1 text-xs bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded-full font-mono font-medium">
                                <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
                                {b.batch_code}
                                <span className="font-sans font-normal text-green-600 opacity-70">· {b.product_name}</span>
                            </span>
                        ))}
                        {pendingBatches.map(b => (
                            <span key={b.batch_id} className="inline-flex items-center gap-1 text-xs bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full font-mono font-medium">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                                {b.batch_code}
                                <span className="font-sans font-normal text-amber-600 opacity-70">· pending</span>
                            </span>
                        ))}
                    </div>

                    {uniqueParts.length > 0 ? (
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-xs font-semibold text-gray-400 uppercase border-b border-gray-100">
                                    <th className="text-left pb-2">Part</th>
                                    <th className="text-left pb-2">Type</th>
                                    <th className="text-right pb-2 w-36">Daily Target</th>
                                </tr>
                            </thead>
                            <tbody>
                                {uniqueParts.map(part => (
                                    <tr key={part.part_id} className="border-b border-gray-50 last:border-b-0">
                                        <td className="py-2.5 text-gray-700 font-medium">{part.part_name}</td>
                                        <td className="py-2.5">
                                            <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${PART_TYPE_BADGE[part.part_type] ?? 'bg-gray-100 text-gray-500'}`}>
                                                {part.part_type}
                                            </span>
                                        </td>
                                        <td className="py-2.5 text-right">
                                            <QtyInput
                                                value={targets[tKeyPiece(line.line_id, part.part_id)] ?? ''}
                                                onChange={val => onQtyChange(tKeyPiece(line.line_id, part.part_id), val)}
                                            />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    ) : (
                        <p className="text-xs text-gray-400 italic">No piece parts defined for this product.</p>
                    )}
                </div>
            )}

            {/* ── GARMENT: one target for the whole line, batches shown as context ── */}
            {line.target_type === 'GARMENT' && line.batches.length > 0 && (
                <div className="px-5 py-4">
                    {/* Batch context pills */}
                    <div className="flex flex-wrap gap-1.5 mb-4">
                        {activeBatches.map(b => (
                            <span key={b.batch_id} className="inline-flex items-center gap-1 text-xs bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded-full font-mono font-medium">
                                <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
                                {b.batch_code}
                                <span className="font-sans font-normal text-green-600 opacity-70">· {b.product_name}</span>
                            </span>
                        ))}
                        {pendingBatches.map(b => (
                            <span key={b.batch_id} className="inline-flex items-center gap-1 text-xs bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full font-mono font-medium">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                                {b.batch_code}
                                <span className="font-sans font-normal text-amber-600 opacity-70">· pending</span>
                            </span>
                        ))}
                    </div>
                    <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600">Garment target for today</span>
                        <QtyInput
                            value={targets[tKeyGarment(line.line_id)] ?? ''}
                            onChange={val => onQtyChange(tKeyGarment(line.line_id), val)}
                        />
                    </div>
                </div>
            )}
        </div>
    );
}

// ──────────────────────────────────────────────────────────────
// Toast
// ──────────────────────────────────────────────────────────────

function Toast({ toast }) {
    if (!toast) return null;
    const ok = toast.type === 'success';
    return (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-xl
                         shadow-lg text-white text-sm font-medium
                         ${ok ? 'bg-emerald-600' : 'bg-red-600'}`}>
            {ok ? <LuCircleCheck size={16} /> : <LuCircleAlert size={16} />}
            {toast.msg}
        </div>
    );
}

// ──────────────────────────────────────────────────────────────
// Summary strip
// ──────────────────────────────────────────────────────────────

function SummaryStrip({ lines }) {
    const activeLines   = lines.filter(l => l.target_type !== 'SKIP').length;
    const totalBatches  = lines.reduce((s, l) => s + (l.target_type !== 'SKIP' ? l.batches.length : 0), 0);
    const totalPresent  = lines.reduce((s, l) => s + (l.manpower_present  ?? 0), 0);
    const totalAssigned = lines.reduce((s, l) => s + (l.manpower_assigned ?? 0), 0);

    return (
        <div className="grid grid-cols-3 gap-3 mb-5">
            {[
                { label: 'Active lines',      value: activeLines },
                { label: 'Running batches',   value: totalBatches },
                { label: 'Manpower present',  value: `${totalPresent} / ${totalAssigned}` },
            ].map(item => (
                <div key={item.label} className="bg-white border border-gray-200 rounded-xl px-4 py-3 shadow-sm">
                    <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">{item.label}</p>
                    <p className="text-xl font-bold text-gray-800 mt-0.5">{item.value}</p>
                </div>
            ))}
        </div>
    );
}

// ──────────────────────────────────────────────────────────────
// Main page
// ──────────────────────────────────────────────────────────────

export default function ProductionTargetPage() {
    const today = new Date().toISOString().split('T')[0];
    const [targetDate,    setTargetDate]    = useState(today);
    const [lines,         setLines]         = useState([]);
    const [targets,       setTargets]       = useState({});
    const [loading,       setLoading]       = useState(false);
    const [saving,        setSaving]        = useState(false);
    const [toast,         setToast]         = useState(null);
    const [empModalLine,  setEmpModalLine]  = useState(null); // line shown in employee modal

    const showToast = (type, msg) => {
        setToast({ type, msg });
        setTimeout(() => setToast(null), 4000);
    };

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const res     = await productionManagerApi.getTargetFormData(targetDate);
            console.log('Loaded target form data:', res.data);
            const fetched = res.data?.lines ?? [];
            setLines(fetched);
            setTargets(buildInitialTargets(fetched));
        } catch (err) {
            console.error('[ProductionTargets] load error', err);
            showToast('error', 'Failed to load target data.');
        } finally {
            setLoading(false);
        }
    }, [targetDate]);

    useEffect(() => { loadData(); }, [loadData]);

    /** Generic setter: key is already the full tKey string */
    const handleQtyChange = (key, value) => {
        setTargets(prev => ({ ...prev, [key]: value }));
    };

    const handleSave = async () => {
        const entries = [];

        for (const line of lines) {
            if (line.target_type === 'SKIP') continue;

            if (line.target_type === 'PIECE') {
                const primaryBatch = getPrimaryBatch(line);
                if (!primaryBatch) continue;

                const uniqueParts = getUniquePartsForLine(line);
                for (const part of uniqueParts) {
                    const qty = parseInt(targets[tKeyPiece(line.line_id, part.part_id)]);
                    if (qty > 0) {
                        entries.push({
                            line_id:  parseInt(line.line_id),
                            batch_id: parseInt(primaryBatch.batch_id),
                            part_id:  parseInt(part.part_id),
                            quantity: qty,
                        });
                    }
                }
            } else if (line.target_type === 'GARMENT') {
                const primaryBatch = getPrimaryBatch(line);
                if (!primaryBatch) continue;
                const qty = parseInt(targets[tKeyGarment(line.line_id)]);
                if (qty > 0) {
                    entries.push({
                        line_id:  parseInt(line.line_id),
                        batch_id: parseInt(primaryBatch.batch_id),
                        part_id:  null,
                        quantity: qty,
                    });
                }
            }
        }

        if (entries.length === 0) {
            showToast('error', 'Enter at least one target quantity before saving.');
            return;
        }

        setSaving(true);
        try {
            const res = await productionManagerApi.saveTargets({ target_date: targetDate, entries });
            console.log('Save response:', res.data);
            showToast('success', `Saved ${res.data?.saved ?? entries.length} targets.`);
            loadData();
        } catch (err) {
            console.error('[ProductionTargets] save error', err);
            showToast('error', err.response?.data?.error ?? 'Failed to save targets.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="max-w-5xl mx-auto">
            <Toast toast={toast} />

            {/* Employee drill-down modal */}
            {empModalLine && (
                <EmployeeModal
                    line={empModalLine}
                    onClose={() => setEmpModalLine(null)}
                />
            )}

            {/* ── Page header ── */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                <div className="flex items-center gap-3">
                    <LuTarget size={22} className="text-blue-600" />
                    <div>
                        <h1 className="text-xl font-bold text-gray-800">Production Targets</h1>
                        <p className="text-xs text-gray-400 mt-0.5">Set daily piece and garment targets per line</p>
                    </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden shadow-sm bg-white">
                        <span className="px-2.5 text-gray-400 border-r border-gray-200 py-2">
                            <LuCalendar size={15} />
                        </span>
                        <input
                            type="date"
                            value={targetDate}
                            onChange={e => setTargetDate(e.target.value)}
                            className="px-3 py-2 text-sm text-gray-700 bg-white focus:outline-none"
                        />
                    </div>

                    <button
                        onClick={loadData}
                        disabled={loading}
                        className="flex items-center gap-1.5 px-3 py-2 border border-gray-300 rounded-lg text-sm
                                   text-gray-600 hover:bg-gray-50 disabled:opacity-50 bg-white shadow-sm"
                    >
                        <LuRefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                        Refresh
                    </button>

                    <button
                        onClick={handleSave}
                        disabled={saving || loading}
                        className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg
                                   text-sm font-medium hover:bg-blue-700 disabled:opacity-50 shadow-sm"
                    >
                        <LuSave size={14} />
                        {saving ? 'Saving…' : 'Save Targets'}
                    </button>
                </div>
            </div>

            {/* Loading */}
            {loading && (
                <div className="flex justify-center items-center py-20 text-gray-400">
                    <LuRefreshCw className="animate-spin mr-2" size={20} />
                    Loading lines…
                </div>
            )}

            {/* Empty state */}
            {!loading && lines.length === 0 && (
                <div className="text-center py-20 text-gray-400">
                    <LuPackage size={44} className="mx-auto mb-3 opacity-30" />
                    <p className="font-medium">No active lines found for this date.</p>
                    <p className="text-sm mt-1">Make sure batches are assigned to lines and the lines are active.</p>
                </div>
            )}

            {/* Summary + line cards */}
            {!loading && lines.length > 0 && (
                <>
                    <SummaryStrip lines={lines} />
                    {lines.map(line => (
                        <LineCard
                            key={line.line_id}
                            line={line}
                            targets={targets}
                            onQtyChange={handleQtyChange}
                            onManpowerClick={setEmpModalLine}
                        />
                    ))}
                </>
            )}
        </div>
    );
}

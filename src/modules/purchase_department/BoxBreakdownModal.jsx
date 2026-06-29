import React, { useState, useEffect } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { newTrimBox, sumTrimBoxes } from './inwardShared';

export default function BoxBreakdownModal({ open, title, uom, initialBoxes, onSave, onClose }) {
    const [rows, setRows] = useState([newTrimBox()]);

    useEffect(() => {
        if (open) {
            setRows(
                initialBoxes && initialBoxes.length > 0
                    ? initialBoxes.map(b => newTrimBox(b))
                    : [newTrimBox()]
            );
        }
    }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

    if (!open) return null;

    const total = sumTrimBoxes(rows);

    const addRow    = ()           => setRows(prev => [...prev, newTrimBox()]);
    const removeRow = (k)          => setRows(prev => prev.filter(r => r._k !== k));
    const setField  = (k, f, val)  => setRows(prev => prev.map(r => r._k === k ? { ...r, [f]: val } : r));

    const handleSave = () => {
        const valid = rows
            .filter(r => parseFloat(r.box_count) > 0 && parseFloat(r.qty_per_box) > 0)
            .map(r => newTrimBox(r));
        onSave(valid.length > 0 ? valid : []);
    };

    return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm flex flex-col">
                {/* Header */}
                <div className="flex items-start justify-between px-4 pt-4 pb-3 border-b border-slate-100">
                    <div>
                        <p className="text-xs font-bold text-slate-800">Box Breakdown</p>
                        {title && <p className="text-[10px] text-slate-500 mt-0.5 leading-snug max-w-[200px]">{title}</p>}
                    </div>
                    <button type="button" onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 transition">
                        <X size={14} />
                    </button>
                </div>

                {/* Rows */}
                <div className="px-4 py-3 space-y-2 overflow-y-auto max-h-72">
                    <div className="flex gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-wide px-0.5">
                        <span className="w-20 text-right">Boxes</span>
                        <span className="w-4" />
                        <span className="flex-1 text-right">Qty / box</span>
                        <span className="w-16 text-right">Line total</span>
                        <span className="w-5" />
                    </div>
                    {rows.map(row => {
                        const lineTotal = (parseFloat(row.box_count) || 0) * (parseFloat(row.qty_per_box) || 0);
                        return (
                            <div key={row._k} className="flex items-center gap-2">
                                <input
                                    type="number" min="1" step="1" placeholder="0"
                                    value={row.box_count}
                                    onChange={e => setField(row._k, 'box_count', e.target.value)}
                                    className="w-20 text-xs text-right border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-emerald-400 tabular-nums"
                                    autoFocus={rows.length === 1 && rows[0]._k === row._k}
                                />
                                <span className="text-xs text-slate-400 w-4 text-center shrink-0">×</span>
                                <input
                                    type="number" min="0" step="any" placeholder="0"
                                    value={row.qty_per_box}
                                    onChange={e => setField(row._k, 'qty_per_box', e.target.value)}
                                    className="flex-1 text-xs text-right border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-emerald-400 tabular-nums"
                                />
                                <span className="w-16 text-[10px] text-slate-500 text-right tabular-nums shrink-0">
                                    {lineTotal > 0 ? lineTotal.toLocaleString(undefined, { maximumFractionDigits: 2 }) : ''}
                                </span>
                                <button type="button" onClick={() => removeRow(row._k)}
                                    disabled={rows.length === 1}
                                    className="p-1 text-slate-300 hover:text-red-500 transition disabled:opacity-30 shrink-0">
                                    <Trash2 size={11} />
                                </button>
                            </div>
                        );
                    })}
                </div>

                <div className="px-4 pb-2">
                    <button type="button" onClick={addRow}
                        className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 hover:text-emerald-800 transition">
                        <Plus size={10} /> Add row
                    </button>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
                    <p className="text-[10px] text-slate-500">
                        Total:{' '}
                        <span className="font-bold text-slate-700 tabular-nums">
                            {total.toLocaleString(undefined, { maximumFractionDigits: 2 })} {uom}
                        </span>
                    </p>
                    <div className="flex items-center gap-2">
                        <button type="button" onClick={onClose}
                            className="text-xs text-slate-500 hover:text-slate-700 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition">
                            Cancel
                        </button>
                        <button type="button" onClick={handleSave}
                            className="text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 px-4 py-1.5 rounded-lg transition">
                            Save
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

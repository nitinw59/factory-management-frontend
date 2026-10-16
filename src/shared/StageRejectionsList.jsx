// --- File: src/shared/StageRejectionsList.jsx ---
// Open rejections holding a stage open (server: utils/stageRejectionGuard.js,
// returned as `rejections` with reason REJECTED_PIECES by the stage-completion
// checks). Pieces carry part_name / uid; garments carry garment_uid.
import React from 'react';

const StageRejectionsList = ({ rejections = [] }) => (
    <div className="max-h-[50vh] overflow-y-auto rounded-xl border border-rose-200">
        <table className="w-full text-sm">
            <thead className="bg-rose-50 text-rose-900 text-[11px] uppercase tracking-wider sticky top-0">
                <tr>
                    <th className="text-left px-3 py-2">Roll</th>
                    <th className="text-left px-3 py-2">Size</th>
                    <th className="text-left px-3 py-2">Piece</th>
                    <th className="text-left px-3 py-2">Item</th>
                    <th className="text-left px-3 py-2">Reason</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-rose-100">
                {rejections.map((r, i) => (
                    <tr key={r.cut_piece_log_id || r.garment_uid || i} className="align-top">
                        <td className="px-3 py-2 font-mono font-bold text-slate-700">{r.fabric_roll_id}</td>
                        <td className="px-3 py-2 font-bold text-slate-700">{r.size}</td>
                        <td className="px-3 py-2 font-mono text-slate-700">#{r.piece_sequence}</td>
                        <td className="px-3 py-2">
                            <div className="font-bold text-slate-900">{r.part_name || 'Garment'}</div>
                            <div className="font-mono text-[11px] text-slate-400">{r.uid || r.garment_uid}</div>
                        </td>
                        <td className="px-3 py-2 text-rose-700 font-medium">
                            {r.reason}
                            {r.replacement_requested && (
                                <span className="ml-2 text-[10px] font-black uppercase bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">Replacement requested</span>
                            )}
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    </div>
);

export default StageRejectionsList;

// ─── FABRIC REQUIREMENTS GRID ───────────────────────────────────────────────
// Rows = fabric types, columns = the SOP's colors. Each cell is one fabric
// requirement (fabric_type × color), color-coded by reservation coverage and
// clickable to drill into detail + reserve. Replaces the old
// ProductionTrackingModal expand-row list for fabric.

import { AlertTriangle } from 'lucide-react';
import { buildFabricGridModel } from './buildRequirementsGridModel';
import { getFabricCellStatus, CELL_COLOR_CLS, CELL_COLOR_DOT } from './requirementCellStatus';
import HorizontalScrollFrame from './HorizontalScrollFrame';

const FabricCell = ({ requirement, onClick }) => {
    if (!requirement) {
        return <td className="border border-slate-100 bg-slate-50/40 p-2 align-top" />;
    }
    const status = getFabricCellStatus(requirement);
    const required = Number(requirement.meters_required || 0);
    const reserved = Number(requirement.meters_reserved || 0);
    return (
        <td className="border border-slate-100 p-1 align-top">
            <button
                type="button"
                onClick={() => onClick(requirement)}
                className={`w-full min-w-[110px] rounded-lg border px-2.5 py-2 text-left transition-colors ${CELL_COLOR_CLS[status.color]}`}
                title={`${status.label} · ${reserved.toFixed(2)}/${required.toFixed(2)} m`}
            >
                <div className="flex items-center justify-between gap-1">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${CELL_COLOR_DOT[status.color]}`} />
                    {status.hasOpenPR && (
                        <span className="text-[8px] font-bold uppercase tracking-wide opacity-70">PR</span>
                    )}
                </div>
                <p className="text-xs font-bold mt-1 tabular-nums">{reserved.toFixed(1)}<span className="opacity-50">/{required.toFixed(1)}</span></p>
                <p className="text-[9px] opacity-70">meters</p>
            </button>
        </td>
    );
};

const OrphanCell = ({ requirements }) => (
    <td className="border border-slate-100 p-1 align-top">
        <div
            className="w-full min-w-[110px] rounded-lg border border-dashed border-slate-300 bg-slate-100 px-2.5 py-2 text-slate-400"
            title="Requirement(s) exist for a color no longer on this order"
        >
            <AlertTriangle size={12} />
            <p className="text-[9px] mt-1">{requirements.length} unmapped</p>
        </div>
    </td>
);

const FabricRequirementsGrid = ({ sop, fabricRequirements, onCellClick }) => {
    const { columns, rows } = buildFabricGridModel(sop, fabricRequirements);

    if (rows.length === 0) {
        return (
            <div className="text-center py-12 border-2 border-dashed border-slate-200 rounded-xl">
                <p className="text-sm text-slate-400 italic">No fabric requirements yet — calculate requirements first.</p>
            </div>
        );
    }

    return (
        <HorizontalScrollFrame>
            <table className="border-collapse w-full">
                <thead>
                    <tr>
                        <th className="sticky left-0 z-10 bg-white border border-slate-100 px-3 py-2 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider min-w-[160px]">
                            Fabric Type
                        </th>
                        {columns.map(col => (
                            <th key={col.fabric_color_id} className="border border-slate-100 px-2 py-2 text-center text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                                {col.color_name}
                                {col.color_number && <span className="block font-mono font-normal normal-case text-slate-400">{col.color_number}</span>}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {rows.map(row => (
                        <tr key={row.rowKey}>
                            <td className="sticky left-0 z-10 bg-white border border-slate-100 px-3 py-2 text-xs font-bold text-slate-700 align-top">
                                {row.fabric_type_name}
                            </td>
                            {columns.map(col => (
                                <FabricCell
                                    key={col.fabric_color_id}
                                    requirement={row.cellsByColorId[col.fabric_color_id]}
                                    onClick={onCellClick}
                                />
                            ))}
                            {row.orphanCells.length > 0 && <OrphanCell requirements={row.orphanCells} />}
                        </tr>
                    ))}
                </tbody>
            </table>
        </HorizontalScrollFrame>
    );
};

export default FabricRequirementsGrid;

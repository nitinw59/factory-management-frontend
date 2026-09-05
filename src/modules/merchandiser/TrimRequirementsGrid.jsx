// ─── TRIM REQUIREMENTS GRID ─────────────────────────────────────────────────
// Rows = trim items, columns = the SOP's colors. A color-agnostic trim (no
// fabric_color_id — one requirement covers every color) renders as a single
// cell spanning the whole row rather than being decomposed per color. A
// PER_SIZE trim item renders one sub-row per target_variant_size. The last
// column holds a small "bulk fill" action for trim items whose substitute
// stock can cover ≥2 colors at once (see buildTrimBulkFillGroups) — opens
// TrimFunnelModal.

import { Fragment, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Layers } from 'lucide-react';
import { buildTrimGridModel, buildTrimBulkFillGroupsByItemId } from './buildRequirementsGridModel';
import { getTrimCellStatus, CELL_COLOR_CLS, CELL_COLOR_DOT } from './requirementCellStatus';
import { groupTrimRequirementsByItemId, buildReservedVariantSummary, nameAndNumber } from './trimReservationUtils';
import HorizontalScrollFrame from './HorizontalScrollFrame';

// Hover summary shown on a trim item's name — only rendered when at least one
// of its requirements (across every color/size) actually has a reservation.
// One row per physical reserved variant, with reserved quantities SUMMED
// across every requested color it's covering — e.g. a BLACK variant used both
// as the exact match for its own BLACK requirement and as a substitute for a
// M GRAY requirement shows as one "BLACK — 146 m total" row, not two.
const ReservedVariantSummary = ({ label, itemCode, groups }) => {
    const [open, setOpen] = useState(false);
    const [pos, setPos]   = useState(null);
    const anchorRef = useRef(null);

    if (groups.length === 0) {
        return <>{label}{itemCode && <span className="block font-mono font-normal text-[9px] text-slate-400">{itemCode}</span>}</>;
    }

    const show = () => {
        const rect = anchorRef.current?.getBoundingClientRect();
        if (rect) setPos({ top: rect.bottom + 6, left: rect.left });
        setOpen(true);
    };

    return (
        <span
            ref={anchorRef}
            onMouseEnter={show}
            onMouseLeave={() => setOpen(false)}
            className="cursor-help border-b border-dotted border-violet-300"
        >
            {label}
            {itemCode && <span className="block font-mono font-normal text-[9px] text-slate-400">{itemCode}</span>}
            {open && pos && createPortal(
                <div
                    className="fixed z-[9999] bg-white border border-slate-200 rounded-xl shadow-xl p-2.5 normal-case"
                    style={{ top: pos.top, left: pos.left, maxWidth: 480 }}
                >
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 px-0.5">
                        Reserved Variants · {groups.length}
                    </p>
                    <table className="border-collapse text-[10px]">
                        <thead>
                            <tr className="text-slate-400 uppercase text-[8px]">
                                <th className="text-left px-1.5 py-1">Reserved Variant</th>
                                <th className="text-left px-1.5 py-1">Covers</th>
                                <th className="text-right px-1.5 py-1">Total Reserved</th>
                                <th className="text-center px-1.5 py-1">Sub</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {groups.map((g, i) => (
                                <tr key={i}>
                                    <td className="px-1.5 py-1 font-bold text-slate-700 whitespace-nowrap">
                                        {g.reserved_item_name} – {nameAndNumber(g.reserved_color_name, g.reserved_color_number)}
                                    </td>
                                    <td className="px-1.5 py-1 text-slate-600">
                                        {g.covered.map((c, ci) => (
                                            <span key={ci} className="inline-block whitespace-nowrap mr-1.5">
                                                {nameAndNumber(c.requested_color_name, c.requested_color_number)}
                                                <span className="text-slate-400"> ({c.reserved.toLocaleString()})</span>
                                                {ci < g.covered.length - 1 ? ',' : ''}
                                            </span>
                                        ))}
                                    </td>
                                    <td className="px-1.5 py-1 text-right font-bold text-emerald-700 tabular-nums whitespace-nowrap">
                                        {g.total_reserved.toLocaleString()} {g.unit}
                                    </td>
                                    <td className="px-1.5 py-1 text-center">
                                        {g.any_substitute
                                            ? <span className="text-[8px] font-bold text-purple-700 bg-purple-100 px-1.5 py-0.5 rounded-full">Yes</span>
                                            : <span className="text-slate-300">No</span>}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>,
                document.body
            )}
        </span>
    );
};

const TrimCell = ({ requirement, unit, onClick }) => {
    if (!requirement) {
        return <td className="border border-slate-100 bg-slate-50/40 p-2 align-top" />;
    }
    const status = getTrimCellStatus(requirement);
    const required = Number(requirement.quantity_required || 0);
    const reserved = Number(requirement.quantity_reserved || 0);
    return (
        <td className="border border-slate-100 p-1 align-top">
            <button
                type="button"
                onClick={() => onClick(requirement)}
                className={`w-full min-w-[110px] rounded-lg border px-2.5 py-2 text-left transition-colors ${CELL_COLOR_CLS[status.color]}`}
                title={`${status.label} · ${reserved.toLocaleString()}/${required.toLocaleString()} ${unit}`}
            >
                <div className="flex items-center justify-between gap-1">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${CELL_COLOR_DOT[status.color]}`} />
                    {status.hasOpenPR && (
                        <span className="text-[8px] font-bold uppercase tracking-wide opacity-70">PR</span>
                    )}
                </div>
                <p className="text-xs font-bold mt-1 tabular-nums">{reserved.toLocaleString()}<span className="opacity-50">/{required.toLocaleString()}</span></p>
                <p className="text-[9px] opacity-70">{unit}</p>
            </button>
        </td>
    );
};

const AgnosticCell = ({ requirement, unit, colSpan, onClick }) => {
    if (!requirement) {
        return <td colSpan={colSpan} className="border border-slate-100 bg-slate-50/40 p-2 align-top" />;
    }
    const status = getTrimCellStatus(requirement);
    const required = Number(requirement.quantity_required || 0);
    const reserved = Number(requirement.quantity_reserved || 0);
    return (
        <td colSpan={colSpan} className="border border-slate-100 p-1 align-top">
            <button
                type="button"
                onClick={() => onClick(requirement)}
                className={`w-full rounded-lg border px-3 py-2 text-left transition-colors flex items-center justify-between gap-3 ${CELL_COLOR_CLS[status.color]}`}
                title={`${status.label} · ${reserved.toLocaleString()}/${required.toLocaleString()} ${unit}`}
            >
                <span className="flex items-center gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${CELL_COLOR_DOT[status.color]}`} />
                    <span className="text-[10px] font-bold uppercase tracking-wide opacity-70">All colors</span>
                    {status.hasOpenPR && <span className="text-[8px] font-bold uppercase tracking-wide opacity-70">· PR raised</span>}
                </span>
                <span className="text-xs font-bold tabular-nums">
                    {reserved.toLocaleString()}<span className="opacity-50">/{required.toLocaleString()}</span> {unit}
                </span>
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

const BulkFillButton = ({ onClick }) => (
    <td className="border border-slate-100 p-1 align-top">
        <button
            type="button"
            onClick={onClick}
            title="Bulk fill this trim item across the colors a common substitute covers"
            className="w-full min-w-[80px] h-full flex flex-col items-center justify-center gap-1 rounded-lg border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors px-2 py-2"
        >
            <Layers size={13} />
            <span className="text-[9px] font-bold uppercase tracking-wide">Bulk fill</span>
        </button>
    </td>
);

// Renders one "data row" (either the whole trim item, when it has no size
// split, or one of its PER_SIZE sub-rows) — shared by both call sites below.
// A row is either color-agnostic (one requirement spans every column) or
// per-color (one requirement, or none, per column).
const DataRowCells = ({ node, columns, unit, onCellClick }) => {
    if (node.agnosticRequirement) {
        return <AgnosticCell requirement={node.agnosticRequirement} unit={unit} colSpan={columns.length} onClick={onCellClick} />;
    }
    return (
        <>
            {columns.map(col => (
                <TrimCell
                    key={col.fabric_color_id}
                    requirement={node.cellsByColorId[col.fabric_color_id] ?? null}
                    unit={unit}
                    onClick={onCellClick}
                />
            ))}
        </>
    );
};

const TrimRequirementsGrid = ({ sop, trimRequirements, onCellClick, onBulkFillGroup }) => {
    const { columns, rows } = buildTrimGridModel(sop, trimRequirements);
    const bulkFillByItemId = buildTrimBulkFillGroupsByItemId(trimRequirements);
    const reqsByItemId = groupTrimRequirementsByItemId(trimRequirements);

    if (rows.length === 0) {
        return (
            <div className="text-center py-12 border-2 border-dashed border-slate-200 rounded-xl">
                <p className="text-sm text-slate-400 italic">No trim requirements yet — calculate requirements first.</p>
            </div>
        );
    }

    return (
        <HorizontalScrollFrame>
            <table className="border-collapse w-full">
                <thead>
                    <tr>
                        <th className="sticky left-0 z-10 bg-white border border-slate-100 px-3 py-2 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider min-w-[180px]">
                            Trim Item
                        </th>
                        {columns.map(col => (
                            <th key={col.fabric_color_id} className="border border-slate-100 px-2 py-2 text-center text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                                {col.color_name}
                                {col.color_number && <span className="block font-mono font-normal normal-case text-slate-400">{col.color_number}</span>}
                            </th>
                        ))}
                        <th className="border border-slate-100 px-2 py-2 text-center text-[10px] font-bold text-slate-500 uppercase tracking-wider w-20">
                            Actions
                        </th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map(row => {
                        const unit = row.unit_of_measure || 'pcs';
                        const bulkGroup = bulkFillByItemId.get(String(row.trim_item_id));
                        const variantGroups = buildReservedVariantSummary(reqsByItemId.get(String(row.trim_item_id)) || []);

                        if (!row.subRows) {
                            return (
                                <tr key={row.rowKey}>
                                    <td className="sticky left-0 z-10 bg-white border border-slate-100 px-3 py-2 text-xs font-bold text-slate-700 align-top">
                                        <ReservedVariantSummary label={row.trim_item_name} itemCode={row.item_code} groups={variantGroups} />
                                    </td>
                                    <DataRowCells node={row} columns={columns} unit={unit} onCellClick={onCellClick} />
                                    {row.orphanCells.length > 0 && <OrphanCell requirements={row.orphanCells} />}
                                    {bulkGroup ? <BulkFillButton onClick={() => onBulkFillGroup(bulkGroup)} /> : <td className="border border-slate-100" />}
                                </tr>
                            );
                        }

                        // PER_SIZE: a header row for the trim item, then one row per size.
                        return (
                            <Fragment key={row.rowKey}>
                                <tr className="bg-slate-50/70">
                                    <td className="sticky left-0 z-10 bg-slate-50/70 border border-slate-100 px-3 py-2 text-xs font-bold text-slate-700 align-top">
                                        <ReservedVariantSummary label={row.trim_item_name} itemCode={row.item_code} groups={variantGroups} />
                                        <span className="block text-[9px] font-normal text-slate-400 mt-0.5">{row.subRows.length} sizes</span>
                                    </td>
                                    <td colSpan={columns.length} className="border border-slate-100 bg-slate-50/70" />
                                    {bulkGroup ? <BulkFillButton onClick={() => onBulkFillGroup(bulkGroup)} /> : <td className="border border-slate-100 bg-slate-50/70" />}
                                </tr>
                                {row.subRows.map(subRow => (
                                    <tr key={subRow.subRowKey}>
                                        <td className="sticky left-0 z-10 bg-white border border-slate-100 px-3 py-2 pl-6 text-[11px] font-semibold text-slate-500 align-top">
                                            Size {subRow.target_variant_size}
                                        </td>
                                        <DataRowCells node={subRow} columns={columns} unit={unit} onCellClick={onCellClick} />
                                        {subRow.orphanCells.length > 0 && <OrphanCell requirements={subRow.orphanCells} />}
                                        <td className="border border-slate-100" />
                                    </tr>
                                ))}
                            </Fragment>
                        );
                    })}
                </tbody>
            </table>
        </HorizontalScrollFrame>
    );
};

export default TrimRequirementsGrid;

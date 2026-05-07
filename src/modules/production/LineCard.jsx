import { useState } from 'react';
import { LuUsers } from 'react-icons/lu';

// ── Color helpers ──────────────────────────────────────────────────────────────

export const pctColor = (pct) => {
    if (pct == null) return '#4b5563';
    if (pct >= 90)   return '#10b981';
    if (pct >= 70)   return '#f59e0b';
    if (pct >= 50)   return '#f97316';
    return '#ef4444';
};

export const dhuColor = (dhu) => {
    if (dhu <= 2)  return '#10b981';
    if (dhu <= 5)  return '#f59e0b';
    if (dhu <= 10) return '#f97316';
    return '#ef4444';
};

export const fmt2 = (n) => (Math.round(n * 100) / 100).toFixed(2);

// ── Data merge: combines targetFormData + targetSummary + lineOutput ──────────

export function buildLineData(formLines = [], summaryRows = [], outputLines = []) {
    const summaryByLine = new Map();
    for (const row of summaryRows) {
        const id = String(row.line_id);
        if (!summaryByLine.has(id)) summaryByLine.set(id, []);
        summaryByLine.get(id).push({
            part_id:         row.part_id,
            part_name:       row.part_name,
            part_type:       row.part_type,
            target_quantity: parseInt(row.target_quantity) || 0,
            actual:          parseInt(row.actual)          || 0,
            achievement_pct: row.achievement_pct != null ? parseInt(row.achievement_pct) : null,
            processing_mode: row.processing_mode,
        });
    }

    const outputByLine = new Map();
    for (const ol of outputLines) {
        outputByLine.set(String(ol.line_id), {
            total_output:  parseInt(ol.summary?.total_output)  || 0,
            total_defects: parseInt(ol.summary?.total_defects) || 0,
        });
    }

    return formLines.map(line => {
        const id  = String(line.line_id);
        const out = outputByLine.get(id) ?? { total_output: 0, total_defects: 0 };
        let parts = summaryByLine.get(id) ?? [];

        // Fallback if summary API returned no target parts at all
        if (parts.length === 0) {
            const batches = line.batches ?? [];
            if (line.target_type === 'GARMENT' || line.processing_mode === 'SERIALIZED') {
                const totalTarget = batches.reduce((s, b) =>
                    s + (b.garment_target?.existing_quantity ?? 0), 0);
                if (totalTarget > 0) {
                    parts = [{
                        part_id: 'garment',
                        part_name: 'Garments',
                        part_type: null,
                        target_quantity: totalTarget,
                        actual: out.total_output,
                        achievement_pct: null,
                    }];
                }
            } else {
                const partMap = {};
                for (const batch of batches) {
                    for (const pp of batch.piece_parts ?? []) {
                        if (!partMap[pp.part_id]) {
                            partMap[pp.part_id] = {
                                part_id: pp.part_id,
                                part_name: pp.part_name,
                                part_type: pp.part_type,
                                target_quantity: 0,
                                actual: 0,
                                achievement_pct: null,
                            };
                        }
                        partMap[pp.part_id].target_quantity += pp.existing_quantity ?? 0;
                    }
                }
                parts = Object.values(partMap);
            }
        }

        // Force real output for serialized lines / garments
        parts = parts.map(p => {
            if (p.processing_mode === 'SERIALIZED' || line.processing_mode === 'SERIALIZED' || p.part_id == null) {
                return { ...p, actual: out.total_output, achievement_pct: null };
            }
            return p;
        });

        return {
            ...line,
            parts,
            total_output:       out.total_output,
            total_defects:      out.total_defects,
            batches:            line.batches ?? [],
            employees_assigned: line.employees_assigned ?? [],
            employees_present:  line.employees_present  ?? [],
        };
    });
}

// ── Happy face SVG ─────────────────────────────────────────────────────────────

function HappyFace({ size = 64 }) {
    return (
        <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
            <circle cx="50" cy="50" r="47" fill="#10b981" opacity="0.10" />
            <circle cx="50" cy="50" r="44" stroke="#10b981" strokeWidth="4" />
            <circle cx="34" cy="41" r="7" fill="#10b981" />
            <circle cx="66" cy="41" r="7" fill="#10b981" />
            <path d="M 25 62 Q 50 88 75 62" stroke="#10b981" strokeWidth="6"
                  strokeLinecap="round" fill="none" />
        </svg>
    );
}

// ── Progress bar ───────────────────────────────────────────────────────────────

function ProgressBar({ actual, target, pct }) {
    const computed = pct ?? (target > 0 ? Math.round(actual * 100 / target) : null);
    const width    = Math.min(100, Math.max(0, computed ?? 0));
    const fill     = pctColor(computed);

    return (
        <div>
            <div className="flex justify-between items-baseline mb-1.5">
                <span className="text-sm text-gray-400 tabular-nums">
                    {actual.toLocaleString()} / {target.toLocaleString()}
                </span>
                {computed != null && (
                    <span className="text-lg font-black tabular-nums" style={{ color: fill }}>
                        {computed}%
                    </span>
                )}
            </div>
            <div className="h-4 bg-gray-800 rounded-full overflow-hidden">
                <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${width}%`, backgroundColor: fill }}
                />
            </div>
        </div>
    );
}

// ── Line card ──────────────────────────────────────────────────────────────────

export default function LineCard({ line, defaultExpandEmployees = false }) {
    const [showEmp, setShowEmp] = useState(defaultExpandEmployees);

    const present  = line.manpower_present  ?? 0;
    const assigned = line.manpower_assigned ?? 0;
    const mpRatio  = assigned > 0 ? present / assigned : 0;
    const mpClr    = mpRatio >= 0.9 ? '#10b981'
                   : mpRatio >= 0.7 ? '#f59e0b'
                   : present === 0 && assigned > 0 ? '#ef4444'
                   : '#6b7280';

    const parts     = line.parts ?? [];
    const hasTarget = parts.some(p => p.target_quantity > 0);
    const output    = line.total_output  ?? 0;
    const defects   = line.total_defects ?? 0;
    const dhu       = output > 0 ? (defects / output) * 100 : null;

    const batches      = line.batches ?? [];
    const employeesAll = line.employees_assigned ?? [];
    const absentees    = employeesAll.filter(e => !e.is_present);

    const targetedParts = parts.filter(p => p.target_quantity > 0);
    const isAchieved    = hasTarget && targetedParts.length > 0 && targetedParts.every(p => {
        const pct = p.achievement_pct
            ?? (p.target_quantity > 0 ? Math.round(p.actual * 100 / p.target_quantity) : 0);
        return pct >= 100;
    });

    return (
        <div className={`bg-gray-900 border rounded-2xl overflow-hidden flex flex-col relative
            ${isAchieved
                ? 'border-emerald-600 shadow-lg shadow-emerald-900/40'
                : 'border-gray-800'}`}>

            {isAchieved && (
                <div className="absolute top-3 right-3 z-10 flex flex-col items-center gap-0.5">
                    <HappyFace size={60} />
                    <span className="text-xs font-black text-emerald-400 tracking-widest uppercase">
                        Done!
                    </span>
                </div>
            )}

            {/* Card header */}
            <div className={`px-5 py-4 border-b border-gray-800 ${isAchieved ? 'pr-20' : ''}`}>
                <div className="flex items-start justify-between mb-2">
                    <div className="flex flex-col gap-1 min-w-0">
                        <span className="font-black text-white text-2xl uppercase tracking-wide leading-tight truncate">
                            {line.line_name}
                        </span>
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-xs px-2 py-0.5 rounded font-bold tracking-wide
                                ${line.target_type === 'PIECE'   ? 'bg-blue-950 text-blue-400'
                                : line.target_type === 'GARMENT' ? 'bg-purple-950 text-purple-400'
                                : 'bg-gray-800 text-gray-500'}`}>
                                {line.target_type ?? '—'}
                            </span>
                            {line.processing_mode && (
                                <span className="text-xs text-gray-600 font-mono">{line.processing_mode}</span>
                            )}
                        </div>
                    </div>
                    <button
                        onClick={() => setShowEmp(v => !v)}
                        className="flex items-center gap-1.5 shrink-0 hover:opacity-80 transition-opacity"
                    >
                        <LuUsers size={16} style={{ color: mpClr }} />
                        <span className="font-black text-2xl tabular-nums" style={{ color: mpClr }}>
                            {present}
                        </span>
                        <span className="text-gray-600 text-base">/{assigned}</span>
                    </button>
                </div>

                {batches.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-1">
                        {batches.map(b => (
                            <span key={b.batch_id}
                                className="text-[10px] font-bold font-mono px-2 py-0.5 rounded bg-gray-800 text-gray-400 border border-gray-700">
                                {b.batch_id}
                            </span>
                        ))}
                    </div>
                )}
            </div>

            {showEmp && employeesAll.length > 0 && (
                <div className="px-4 py-3 border-b border-gray-800 bg-gray-950">
                    <div className={`grid grid-cols-2 gap-x-3 gap-y-1 ${defaultExpandEmployees ? '' : 'max-h-36 overflow-y-auto'}`}>
                        {employeesAll.map(e => (
                            <div key={e.emp_id} className="flex items-center justify-between gap-1">
                                <span className={`text-xs truncate ${e.is_present ? 'text-gray-300' : 'text-red-500 line-through'}`}>
                                    {e.name}
                                </span>
                                {e.is_present && e.punch_in && (
                                    <span className="text-[10px] text-gray-600 font-mono shrink-0">{e.punch_in}</span>
                                )}
                            </div>
                        ))}
                    </div>
                    {absentees.length > 0 && (
                        <p className="text-[10px] text-red-500 font-bold mt-1.5 uppercase tracking-widest">
                            {absentees.length} absent
                        </p>
                    )}
                </div>
            )}

            {/* Target progress rows */}
            <div className="flex-1 px-5 py-4 space-y-5">
                {!hasTarget ? (
                    <p className="text-base text-gray-600 italic py-2">No targets set for today.</p>
                ) : (
                    parts.map((part, i) => (
                        <div key={part.part_id ?? `g-${i}`}>
                            <p className="text-sm text-gray-400 mb-2 font-bold uppercase tracking-widest">
                                {part.part_name ?? 'Garments'}
                                {part.part_type && (
                                    <span className="ml-1 text-gray-600 text-xs font-normal normal-case">
                                        · {part.part_type.toLowerCase()}
                                    </span>
                                )}
                            </p>
                            <ProgressBar
                                actual={part.actual}
                                target={part.target_quantity}
                                pct={part.achievement_pct}
                            />
                        </div>
                    ))
                )}
            </div>

            {/* Footer stats */}
            <div className="px-5 py-4 border-t border-gray-800 grid grid-cols-3 gap-2 text-center">
                <div>
                    <p className="text-xs text-gray-500 uppercase tracking-widest font-semibold mb-0.5">Output</p>
                    <p className="text-xl font-black text-white tabular-nums">{output.toLocaleString()}</p>
                </div>
                <div>
                    <p className="text-xs text-gray-500 uppercase tracking-widest font-semibold mb-0.5">Defects</p>
                    <p className="text-xl font-black tabular-nums"
                       style={{ color: defects > 0 ? '#f87171' : '#4b5563' }}>
                        {defects.toLocaleString()}
                    </p>
                </div>
                <div>
                    <p className="text-xs text-gray-500 uppercase tracking-widest font-semibold mb-0.5">DHU</p>
                    <p className="text-xl font-black tabular-nums"
                       style={{ color: dhu != null ? dhuColor(dhu) : '#4b5563' }}>
                        {dhu != null ? fmt2(dhu) : '—'}
                    </p>
                </div>
            </div>
        </div>
    );
}

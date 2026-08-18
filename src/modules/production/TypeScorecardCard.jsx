import { useState, useEffect } from 'react';
import { LuSave } from 'react-icons/lu';
import { pctColor, dhuColor, fmt2, collapseByName } from './LineCard';

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
                <div className="h-full rounded-full transition-all duration-700"
                     style={{ width: `${width}%`, backgroundColor: fill }} />
            </div>
        </div>
    );
}

// One of the two target-comparison tiles (daily-targets-sum vs monthly-set-target)
function TargetTile({ title, subtitle, actual, target, editable, inputValue, onInputChange, onSave, saving }) {
    const pct = target > 0 ? Math.round(actual * 100 / target) : null;
    return (
        <div className="bg-gray-950 border border-gray-800 rounded-xl p-4">
            <p className="text-xs text-gray-500 uppercase tracking-widest font-bold mb-0.5">{title}</p>
            <p className="text-[11px] text-gray-700 mb-3">{subtitle}</p>

            {editable && (
                <div className="flex items-center gap-2 mb-3">
                    <input
                        type="number"
                        min="0"
                        value={inputValue}
                        onChange={e => onInputChange(e.target.value)}
                        placeholder="Set target…"
                        className="w-full bg-gray-900 border border-gray-800 text-white text-sm
                                   rounded px-2.5 py-1.5 focus:outline-none focus:border-gray-600 tabular-nums"
                    />
                    <button
                        onClick={onSave}
                        disabled={saving}
                        title="Save monthly target"
                        className="flex items-center gap-1 text-xs font-bold text-gray-400 hover:text-white
                                   border border-gray-800 hover:border-gray-600 rounded px-2.5 py-1.5
                                   transition-colors disabled:opacity-40 shrink-0"
                    >
                        <LuSave size={13} className={saving ? 'animate-pulse' : ''} />
                        Save
                    </button>
                </div>
            )}

            <div className="flex items-baseline justify-between">
                <span className="text-sm text-gray-400 tabular-nums">
                    {actual.toLocaleString()} / {target > 0 ? target.toLocaleString() : '—'}
                </span>
                <span className="text-xl font-black tabular-nums" style={{ color: pctColor(pct) }}>
                    {pct != null ? `${pct}%` : '—'}
                </span>
            </div>
        </div>
    );
}

export default function TypeScorecardCard({
    lineTypeName, summary,
    monthlyTarget, onSaveMonthlyTarget, savingMonthlyTarget,
}) {
    const [draftTarget, setDraftTarget] = useState('');

    // Keep the input in sync with the saved value whenever it (re)loads —
    // but don't clobber an in-progress edit if it's already been touched.
    useEffect(() => {
        setDraftTarget(monthlyTarget?.target_quantity != null ? String(monthlyTarget.target_quantity) : '');
    }, [monthlyTarget?.target_quantity, monthlyTarget?.line_type_id, monthlyTarget?.month]);

    if (!summary) {
        return (
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 text-center text-gray-600">
                Unable to load production data for this line type.
            </div>
        );
    }

    const { line_type, parts = [], totals = {} } = summary;
    const trackingAvailable = line_type?.tracking_available !== false;
    const mergedParts = collapseByName(parts);
    const dhu = totals.dhu;
    const totalOutput = totals.total_output ?? 0;

    return (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
            <div className="px-6 py-5 border-b border-gray-800">
                <div className="flex items-center justify-between flex-wrap gap-4">
                    <div>
                        <p className="text-xs text-gray-500 uppercase tracking-widest font-bold mb-1">
                            Production — Merged Line Type
                        </p>
                        <h2 className="text-2xl font-black text-white uppercase tracking-wide">
                            {lineTypeName || '—'}
                        </h2>
                    </div>

                    <div className="flex items-center gap-6">
                        <div className="text-center">
                            <p className="text-xs text-gray-500 uppercase tracking-wide mb-0.5">Output</p>
                            <span className="text-2xl font-black text-white tabular-nums">
                                {totalOutput.toLocaleString()}
                            </span>
                        </div>
                        <div className="text-center">
                            <p className="text-xs text-gray-500 uppercase tracking-wide mb-0.5">DHU</p>
                            <span className="text-2xl font-black tabular-nums"
                                  style={{ color: dhu != null ? dhuColor(dhu) : '#4b5563' }}>
                                {dhu != null ? fmt2(dhu) : '—'}
                            </span>
                        </div>
                        <div className="text-center">
                            <p className="text-xs text-gray-500 uppercase tracking-wide mb-0.5">Defects</p>
                            <span className="text-2xl font-black tabular-nums"
                                  style={{ color: (totals.total_defects ?? 0) > 0 ? '#f87171' : '#4b5563' }}>
                                {(totals.total_defects ?? 0).toLocaleString()}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Two target comparisons, side by side — deliberately separate figures */}
            <div className="px-6 pt-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <TargetTile
                    title="vs Daily Targets"
                    subtitle="Sum of Production Manager's day-by-day targets"
                    actual={totals.actual ?? 0}
                    target={totals.target_quantity ?? 0}
                />
                <TargetTile
                    title="vs Monthly Target"
                    subtitle="Set here — this page only"
                    actual={totalOutput}
                    target={monthlyTarget?.target_quantity ?? 0}
                    editable
                    inputValue={draftTarget}
                    onInputChange={setDraftTarget}
                    onSave={() => onSaveMonthlyTarget?.(draftTarget)}
                    saving={savingMonthlyTarget}
                />
            </div>

            <div className="px-6 py-5 space-y-5">
                {!trackingAvailable && (
                    <p className="text-sm text-gray-600 italic py-2">
                        No unit-level production tracking is configured for this line type
                        {mergedParts.length > 0 ? ' — showing target totals only.' : '.'}
                    </p>
                )}

                {mergedParts.length === 0 ? (
                    <p className="text-base text-gray-600 italic py-2">
                        No daily targets set for this period.
                    </p>
                ) : (
                    mergedParts.map((part, i) => (
                        <div key={part.part_id ?? `g-${i}`}>
                            <p className="text-sm text-gray-400 mb-2 font-bold uppercase tracking-widest">
                                {part.part_name || 'Garments'}
                                {part.part_type && (
                                    <span className="ml-1 text-gray-600 text-xs font-normal normal-case">
                                        · {part.part_type.toLowerCase()}
                                    </span>
                                )}
                            </p>
                            <ProgressBar actual={part.actual} target={part.target_quantity} pct={part.achievement_pct} />
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}

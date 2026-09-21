// ─── SOP STAGE TRAIL ─────────────────────────────────────────────────────────
// Shipment-tracker-style row of interactive nodes for one product line's
// lifecycle (see sopStageStatus.js for how each node's status is derived).
// Every node is always clickable — clicking ahead of where a SOP actually is
// (e.g. "Fabric" before a BOM is linked) still opens the workspace, which
// itself explains what's missing (empty states, disabled toolbar buttons).

const DOT_CLS = {
    info:     'bg-violet-500',
    green:    'bg-emerald-500',
    red:      'bg-red-500',
    disabled: 'bg-slate-300',
};

const RING_STROKE = {
    gray:    '#cbd5e1', // slate-300
    partial: '#3b82f6', // blue-500 — matches the grids' own "partially reserved" color
    green:   '#10b981', // emerald-500
};

const RING_TEXT_CLS = {
    gray:    'fill-slate-400',
    partial: 'fill-blue-600',
    green:   'fill-emerald-600',
};

const NODE_SIZE = 28;

const isNodeComplete = (stage) =>
    stage.kind === 'ring' ? stage.status === 'green' : stage.status === 'green' || stage.status === 'info';

const RingNode = ({ pct, status }) => {
    const r = (NODE_SIZE - 5) / 2;
    const circ = 2 * Math.PI * r;
    const frac = Math.max(0, Math.min(1, pct / 100));
    const c = NODE_SIZE / 2;
    return (
        <svg width={NODE_SIZE} height={NODE_SIZE} viewBox={`0 0 ${NODE_SIZE} ${NODE_SIZE}`}>
            <circle cx={c} cy={c} r={r} fill="none" stroke="#e2e8f0" strokeWidth="3" />
            <circle cx={c} cy={c} r={r} fill="none" stroke={RING_STROKE[status]} strokeWidth="3"
                strokeDasharray={circ} strokeDashoffset={circ * (1 - frac)} strokeLinecap="round"
                transform={`rotate(-90 ${c} ${c})`} />
            <text x={c} y={c + 3} textAnchor="middle" fontSize="8" fontWeight="700" className={RING_TEXT_CLS[status]}>
                {Math.round(pct)}
            </text>
        </svg>
    );
};

const DotNode = ({ status }) => (
    <div className={`rounded-full flex items-center justify-center ${DOT_CLS[status]}`} style={{ width: NODE_SIZE, height: NODE_SIZE }}>
        <div className="w-2 h-2 rounded-full bg-white/80" />
    </div>
);

const SopStageTrail = ({ stages, onNodeClick }) => (
    <div className="flex items-start">
        {stages.map((stage, i) => (
            <div key={stage.key} className="contents">
                <button
                    type="button"
                    onClick={() => onNodeClick(stage.key)}
                    title={stage.label}
                    className="flex flex-col items-center gap-1 w-16 shrink-0 group"
                >
                    {stage.kind === 'ring'
                        ? <RingNode pct={stage.pct} status={stage.status} />
                        : <DotNode status={stage.status} />}
                    <span className="text-[9px] font-bold text-slate-500 group-hover:text-violet-600 text-center leading-tight transition-colors">
                        {stage.label}
                    </span>
                </button>
                {i < stages.length - 1 && (
                    <div
                        className={`flex-1 h-0.5 rounded-full ${isNodeComplete(stage) ? 'bg-emerald-400' : 'bg-slate-200'}`}
                        style={{ marginTop: NODE_SIZE / 2 }}
                    />
                )}
            </div>
        ))}
    </div>
);

export default SopStageTrail;

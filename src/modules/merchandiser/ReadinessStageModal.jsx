// ─── READINESS STAGE MODAL ───────────────────────────────────────────────────
// Dedicated overlay for the trail's "Production Ready" node — the Force
// Ready/Revert toggle that used to live in MerchandiserSopWorkspace's identity
// strip (and, before that, SopSummaryCard).

import { useState } from 'react';
import { CheckCircle2, Loader2, ShieldCheck, ShieldOff, X } from 'lucide-react';
import { planningApi } from '../../api/planningApi';

const READINESS_CFG = {
    in_planning:          { label: 'In Planning',  cls: 'bg-amber-50  text-amber-600  border-amber-200',   icon: null },
    ready_for_production: { label: 'Ready',        cls: 'bg-emerald-50 text-emerald-600 border-emerald-200', icon: CheckCircle2 },
    force_ready:          { label: 'Force Ready',  cls: 'bg-violet-50 text-violet-700 border-violet-200',  icon: ShieldCheck },
};

const ReadinessStageModal = ({ sop, onDone, onClose }) => {
    const [loading, setLoading] = useState(false);
    const [err,     setErr]     = useState(null);

    const readinessCfg = READINESS_CFG[sop.production_readiness] || READINESS_CFG.in_planning;
    const ReadinessIcon = readinessCfg.icon;
    const isForceReady = sop.production_readiness === 'force_ready';

    const handleToggle = async () => {
        setLoading(true);
        setErr(null);
        try {
            await planningApi.updateProductionReadiness(sop.id, isForceReady ? 'in_planning' : 'force_ready');
            onDone && onDone();
        } catch (e) {
            setErr(e?.response?.data?.error || e?.response?.data?.message || 'Failed to update readiness.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
                <div className="flex items-start justify-between mb-3">
                    <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Production Ready</p>
                        <h2 className="font-extrabold text-slate-800 text-base">{sop.product_name}</h2>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1"><X size={18} /></button>
                </div>

                <div className="flex items-center gap-2 mb-4">
                    <span className={`text-xs px-2.5 py-1 rounded-full font-bold uppercase border flex items-center gap-1.5 ${readinessCfg.cls}`}>
                        {ReadinessIcon && <ReadinessIcon size={12} />}
                        {readinessCfg.label}
                    </span>
                </div>

                <p className="text-xs text-slate-500 mb-4">
                    {isForceReady
                        ? 'This line was manually marked ready, overriding the automatic readiness check. Revert to let it follow material coverage again.'
                        : 'Marking this line force-ready overrides the automatic readiness check (normally driven by fabric/trim reservation coverage).'}
                </p>

                {err && <p className="text-xs text-red-500 mb-3">{err}</p>}

                <button
                    onClick={handleToggle}
                    disabled={loading}
                    className={`w-full flex items-center justify-center gap-2 text-sm font-bold px-4 py-2.5 rounded-xl transition-colors disabled:opacity-50 ${
                        isForceReady
                            ? 'text-slate-600 bg-slate-100 hover:bg-red-50 hover:text-red-600'
                            : 'text-white bg-violet-600 hover:bg-violet-700'
                    }`}
                >
                    {loading
                        ? <Loader2 size={14} className="animate-spin" />
                        : isForceReady ? <ShieldOff size={14} /> : <ShieldCheck size={14} />}
                    {isForceReady ? 'Revert to Auto Readiness' : 'Force Mark as Ready'}
                </button>
            </div>
        </div>
    );
};

export default ReadinessStageModal;

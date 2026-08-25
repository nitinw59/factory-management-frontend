import React, { useState, useEffect } from 'react';
import { ShieldCheck, ShieldAlert, ShieldQuestion, Loader2 } from 'lucide-react';
import { finalQcApi } from '../../api/finalQcApi';
import { gateStyleOf } from './finalQcStatusConfig';

// Small dispatch-readiness badge — "QC cleared" (green) / "no QC inspection"
// (amber) / "QC failed" (red). Drop into any batch detail / dispatch screen:
//   <QcGateBadge batchId={batch.id} />
// Fetches its own status; pass onClick to make it link into the inspection.
const QcGateBadge = ({ batchId, onClick, className = '' }) => {
    const [gate, setGate] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!batchId) return;
        let cancelled = false;
        setLoading(true);
        finalQcApi.getGateStatus(batchId)
            .then(res => { if (!cancelled) setGate(res.data); })
            .catch(() => { if (!cancelled) setGate(null); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [batchId]);

    if (loading) {
        return (
            <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border bg-slate-50 text-slate-400 border-slate-200 ${className}`}>
                <Loader2 size={10} className="animate-spin" /> QC…
            </span>
        );
    }
    if (!gate) return null;

    const style = gateStyleOf(gate.cleared_for_dispatch, gate.latest_inspection);
    const Icon = gate.cleared_for_dispatch ? ShieldCheck : gate.latest_inspection ? ShieldAlert : ShieldQuestion;

    return (
        <button
            type="button"
            onClick={onClick}
            disabled={!onClick}
            title={gate.reason}
            className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border transition-colors ${style.cls} ${onClick ? 'cursor-pointer hover:opacity-80' : 'cursor-default'} ${className}`}
        >
            <Icon size={11} /> {style.label}
        </button>
    );
};

export default QcGateBadge;

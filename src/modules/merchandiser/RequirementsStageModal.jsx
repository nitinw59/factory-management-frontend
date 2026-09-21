// ─── REQUIREMENTS STAGE MODAL ────────────────────────────────────────────────
// Dedicated overlay for the trail's "Requirements" node — triggers the same
// calculate/recalculate flow that used to live behind SopHeaderToolbar's
// "Calculate/Recalculate Requirements" button, immediately on open (the node
// click IS the button click now, so no extra step in between).

import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { planningApi } from '../../api/planningApi';
import { Spinner, useSecondaryFabricInfo } from './merchandiserShared';
import RecalculateConfirmModal, { logRecalcBrief } from './RecalculateConfirmModal';
import FinalizeQuantitiesModal from './FinalizeQuantitiesModal';

const RequirementsStageModal = ({ sop, fabricTypes, onDone, onClose }) => {
    const [loadingPreview, setLoadingPreview] = useState(true);
    const [preview,        setPreview]        = useState(null);
    const [err,            setErr]            = useState(null);
    const [showConfirm,    setShowConfirm]    = useState(false);
    const [showQuantityPicker, setShowQuantityPicker] = useState(false);

    const { clusters: secondaryClusters } = useSecondaryFabricInfo(sop.bom_id);

    useEffect(() => {
        if (!sop.bom_id) { setLoadingPreview(false); return; }
        let cancelled = false;
        planningApi.getRecalculationPreview(sop.id)
            .then(res => {
                if (cancelled) return;
                const data = res.data?.data ?? res.data;
                logRecalcBrief('PREVIEW', sop, data);
                if (!data?.has_existing_data) {
                    setShowQuantityPicker(true);
                } else {
                    setPreview(data);
                    setShowConfirm(true);
                }
            })
            .catch(e => {
                if (cancelled) return;
                const status = e?.response?.status;
                setErr(
                    e?.response?.data?.error
                    || (status === 403 ? 'Not permitted for your role.'
                        : status ? `Recalculation preview failed (HTTP ${status})`
                        : 'Recalculation preview failed')
                );
            })
            .finally(() => { if (!cancelled) setLoadingPreview(false); });
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sop.id, sop.bom_id]);

    const doRecalculate = () => {
        logRecalcBrief('CONFIRM', sop, preview);
        setShowConfirm(false);
        setPreview(null);
        setErr(null);
        setShowQuantityPicker(true);
    };

    if (!sop.bom_id) {
        return (
            <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
                    <div className="flex items-start justify-between mb-2">
                        <h2 className="font-extrabold text-slate-800 text-base">No BOM linked yet</h2>
                        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1"><X size={18} /></button>
                    </div>
                    <p className="text-sm text-slate-500">Link a BOM for {sop.product_name} first — requirements are calculated from its fabric/trim consumption.</p>
                </div>
            </div>
        );
    }

    if (loadingPreview) {
        return (
            <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl shadow-2xl p-8"><Spinner /></div>
            </div>
        );
    }

    if (err) {
        return (
            <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
                    <div className="flex items-start justify-between mb-2">
                        <h2 className="font-extrabold text-slate-800 text-base">Couldn't load preview</h2>
                        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1"><X size={18} /></button>
                    </div>
                    <p className="text-sm text-red-500">{err}</p>
                </div>
            </div>
        );
    }

    return (
        <>
            {showConfirm && (
                <RecalculateConfirmModal
                    preview={preview}
                    sopName={sop?.product_name}
                    clusterInfo={secondaryClusters}
                    sopColors={sop.colors}
                    busy={false}
                    err={null}
                    onClose={onClose}
                    onConfirm={doRecalculate}
                />
            )}
            {showQuantityPicker && (
                <FinalizeQuantitiesModal
                    sop={sop}
                    fabricTypes={fabricTypes}
                    onClose={onClose}
                    onDone={() => { onDone && onDone(); onClose(); }}
                />
            )}
        </>
    );
};

export default RequirementsStageModal;

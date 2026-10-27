// A scanned garment (27 Oct 2026 — 2.0's scan screen in 3.0): the full-screen card with APPROVE / REPAIR NOW / REWORK
// (PASSED when it is in rework here or carries a part rejected earlier); one tap and it closes, ready for the next scan.
// Same rules and calls as the garment tiles (GarmentPanel); an already checked garment shows its status with Undo.
import { useCallback, useEffect, useState } from 'react';
import { productionApi } from '../api/productionApi';
import { apiError } from '../api/mastersApi';
import InspectOverlay from './InspectOverlay';

const label = (s) => String(s || '').toLowerCase().replace('_', ' ');
const rollOf = (no) => String(no).split('-').slice(-3, -2)[0] || '';

// scan: the lookup result (garment no., batch, size, colour, scanned piece, stages so far).
// onMissing: the garment isn't in the batch's view at this stage (its roll / size isn't loaded on this line yet).
export default function ScanGarmentCard({ scan, stageId, lineId, codes, multi, act, askUndo, tick, onClose, onActed, onMissing }) {
    const [garment, setGarment] = useState(undefined);   // undefined: loading · null: not in the batch at this stage
    const [error, setError] = useState('');
    const load = useCallback(() => productionApi.batchGarments(scan.batch_id, stageId)
        .then(res => setGarment(res.data.garments.find(g => String(g.id) === String(scan.id)) || null))
        .catch(err => setError(apiError(err, 'Failed to load the garment.'))), [scan.batch_id, scan.id, stageId]);
    useEffect(() => { load(); }, [load, tick]);
    useEffect(() => { if (garment === null) onMissing(scan); }, [garment]); // eslint-disable-line react-hooks/exhaustive-deps

    const item = garment && {
        id: garment.id, label: garment.garment_no, status: garment.status, gate_ok: garment.gate_ok, blocked: garment.blocked_by.join(', '),
        flag: !garment.status && garment.flagged.length ? garment.flagged.map(f => `${f.part_name} @ ${f.rejected_at}`).join(', ') : null,
    };
    const card = {
        kicker: `Batch #${scan.floor_no} · ${scan.batch_code}`,
        title: scan.garment_no,
        empty: garment === null ? 'This garment is not in the batch at this stage.' : error || 'Loading…',
        lines: [['Size', scan.size], ['Colour', scan.colour], ['Roll', rollOf(scan.garment_no) ? `#${rollOf(scan.garment_no)}` : ''], ['Scanned', scan.scanned_piece ? `${scan.scanned_part || 'piece'} label` : 'garment no.']],
        notes: [
            ...(error ? [['rose', error]] : []),
            ...(garment && !garment.status && !garment.gate_ok ? [['amber', `Waiting for ${garment.blocked_by.join(', ')} — check it there first.`]] : []),
            ...(garment && !garment.status && garment.flagged.length ? [['rose', `Part rejected earlier: ${garment.flagged.map(f => `${f.part_name} at ${f.rejected_at}`).join(', ')} — repair it here and tap PASSED.`]] : []),
        ],
        history: (scan.stages || []).map(s => `${s.name}: ${label(s.status)}${s.line ? ` · ${s.line}` : ''}`),
    };
    const base = (ids) => ({ batch_id: scan.batch_id, stage_type_id: stageId, production_line_id: lineId, garment_ids: ids });
    // act() → true once saved (false: a supervisor dialog took over); onActed records it in the recent scans.
    const run = async (fn, what) => { const ok = await act(fn, what, 'garment'); if (ok) onActed(scan.garment_no, what); };
    return (
        <InspectOverlay key={`${scan.id}-${scan.ts}-${garment ? 1 : 0}`} head={[['Batch', `#${scan.floor_no}`], ['Garment', scan.garment_no], ['Size', scan.size], ['Colour', scan.colour]]}
            items={item ? [item] : []} codes={codes} unit="garment" multi={multi} card={card} highlightId={item?.id}
            startFix={Boolean(item && (item.status === 'NEEDS_REWORK' || item.flag))} onClose={onClose} onDone={onClose}
            onApprove={(x) => run((e) => productionApi.garmentCheck({ ...base(x), status: 'APPROVED', ...e }), 'Approved')}
            onRepairNow={(x, code) => run((e) => productionApi.garmentCheck({ ...base(x), status: 'REPAIRED', defect_code_id: code, ...e }), 'Repaired now')}
            onRework={(x, code) => run((e) => productionApi.garmentCheck({ ...base(x), status: 'NEEDS_REWORK', defect_code_id: code, ...e }), 'To rework')}
            onRepair={(x) => run((e) => productionApi.garmentRepair({ ...base(x), ...e }), 'Repaired')}
            onUndo={(it) => askUndo({ text: `Garment ${it.label} is ${label(it.status)}.`, unit: 'garment', body: { garment_ids: [it.id] }, batchId: scan.batch_id })} />
    );
}

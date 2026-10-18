// Garment stage check (assembly onwards), laid out like 2.0 (18 Oct 2026): a row per size × colour with a progress
// bar, INSPECT and FIX REWORK; INSPECT opens the full-screen tile grid of garments (InspectOverlay). A garment can be
// checked once its parts (and earlier garment stages) are cleared; a garment carrying a part rejected earlier is
// flagged — "PASSED" (repaired) here rescues that part and cancels its re-cut (decision 10). Tap a checked garment to
// undo it (a supervisor's password unless a manager). A scanned piece label / garment number opens its garment.
import { useCallback, useEffect, useState } from 'react';
import { Shirt, Ruler } from 'lucide-react';
import { productionApi } from '../api/productionApi';
import { apiError } from '../api/mastersApi';
import { ErrorBox, Loading } from '../components/ui';
import InspectOverlay from './InspectOverlay';
import { WhyPanel, ProgressRow } from './stationShared';

const label = (s) => String(s || '').toLowerCase().replace('_', ' ');
// 501-27-28-001 (batch, roll, size, garment) → tile 1, roll 27
const tileNo = (no) => Number(String(no).split('-').pop()) || no;
const rollOf = (no) => String(no).split('-').slice(-3, -2)[0] || '';

export default function GarmentPanel({ batchId, stageId, lineId, codes, act, askUndo, tick = 0, focus, blockedMsg }) {
    const [view, setView] = useState(null);
    const [error, setError] = useState('');
    const [inspect, setInspect] = useState(null);   // { key, fix, highlightId }
    const load = useCallback(() => productionApi.batchGarments(batchId, stageId).then(res => setView(res.data)).catch(err => setError(apiError(err, 'Failed to load the garments.'))), [batchId, stageId]);
    useEffect(() => { load(); }, [load, tick]);   // tick: live refresh / a check from the page
    const groups = [];
    for (const g of view?.garments || []) {
        const key = `${g.size_id}|${g.garment_colour_id}`;
        let x = groups.find(y => y.key === key); if (!x) { x = { key, size: g.size, colour: g.colour, garments: [] }; groups.push(x); } x.garments.push(g);
    }
    // A scanned garment: open its size × colour with it picked.
    useEffect(() => {
        if (!focus || !view) return;
        const g = view.garments.find(x => x.id === focus.id);
        if (g) setInspect({ key: `${g.size_id}|${g.garment_colour_id}`, highlightId: g.id });
    }, [focus, view]);
    if (!view) return <div className="p-6">{error ? <ErrorBox text={error} /> : <Loading />}</div>;

    const base = (ids) => ({ batch_id: batchId, stage_type_id: stageId, production_line_id: lineId, garment_ids: ids });
    const c = view.counts;
    let overlay = null;
    if (inspect) {
        const grp = groups.find(x => x.key === inspect.key);
        const list = grp?.garments || [];
        const multiRoll = new Set(list.map(g => rollOf(g.garment_no))).size > 1;
        const items = list.map(g => ({
            id: g.id, label: tileNo(g.garment_no), group: multiRoll ? `Roll #${rollOf(g.garment_no)}` : '', status: g.status, gate_ok: g.gate_ok, blocked: g.blocked_by.join(', '),
            flag: !g.status && g.flagged.length ? g.flagged.map(f => `${f.part_name} @ ${f.rejected_at}`).join(', ') : null, replacement: g.parts.some(p => p.replacement),
            title: `${g.garment_no}${g.flagged.length ? ` — ${g.flagged.map(f => `${f.part_name} rejected at ${f.rejected_at}`).join(', ')}` : ''}${!g.gate_ok ? ` — waiting: ${g.blocked_by.join(', ')}` : ''}`,
        }));
        overlay = (
            <InspectOverlay key={inspect.key} head={[['Batch', `#${view.batch.floor_no}`], ['Size', grp ? grp.size : ''], ['Colour', grp ? grp.colour : '']]} items={items} codes={codes} unit="garment"
                startFix={inspect.fix} highlightId={inspect.highlightId} onClose={() => setInspect(null)}
                onApprove={(x) => act((e) => productionApi.garmentCheck({ ...base(x), status: 'APPROVED', ...e }), 'Approved', 'garment')}
                onRework={(x, code) => act((e) => productionApi.garmentCheck({ ...base(x), status: 'NEEDS_REWORK', defect_code_id: code, ...e }), 'To rework', 'garment')}
                onReject={(x, code) => act((e) => productionApi.garmentCheck({ ...base(x), status: 'QC_REJECTED', defect_code_id: code, ...e }), 'Rejected', 'garment')}
                onRepair={(x) => act((e) => productionApi.garmentRepair({ ...base(x), ...e }), 'Repaired', 'garment')}
                onUndo={(it) => askUndo({ text: `Garment ${it.label} is ${label(it.status)}.`, unit: 'garment', body: { garment_ids: [it.id] } })} />
        );
    }

    return (
        <div className="p-4 md:p-6 bg-slate-100 space-y-4">
            <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm font-bold text-slate-600">Stage <b className="uppercase">{label(view.progress.status)}</b> · {c.total} garments · {c.pending} to check{c.flagged ? ` · ${c.flagged} flagged` : ''} · {c.approved} OK · {c.rework} rework · {c.rejected} rejected · route {view.route.map(r => r.name).join(' → ')}</span>
                <span className="ml-auto"><WhyPanel floorNo={view.batch.floor_no} batchId={batchId} stageId={stageId} complete={view.progress.status === 'COMPLETED'} tick={tick} onFixed={load} /></span>
            </div>
            {!view.first && <p className="text-sm font-semibold text-slate-600">Loaded: {view.loads.length ? view.loads.map(l => `${l.size} → ${l.line}${l.status === 'COMPLETED' ? ' (done)' : ''}`).join(' · ') : 'nothing yet — the line loader loads sizes onto your line'}</p>}
            <ErrorBox text={error} />
            {blockedMsg && <p className="text-sm font-bold text-rose-700">{blockedMsg}.</p>}
            <div className="border-l-[6px] border-violet-500 bg-white rounded-r-xl p-3 md:p-4 shadow-sm space-y-3">
                <h3 className="font-black text-black flex items-center text-base uppercase tracking-widest bg-slate-100 px-3 py-1.5 rounded-lg w-max border border-slate-300"><Ruler className="w-4 h-4 mr-2 text-violet-600" /> Garments by size</h3>
                {groups.map(g => {
                    const gs = g.garments;
                    const n = (f) => gs.filter(f).length;
                    const flagged = n(x => !x.status && x.gate_ok && x.flagged.length);
                    const rework = n(x => x.status === 'NEEDS_REWORK');
                    const waiting = n(x => !x.status && !x.gate_ok);
                    return <ProgressRow key={g.key} icon={Shirt} label={`Size ${g.size}`} sub={g.colour} unit="garments"
                        notes={[...(waiting ? [['amber', `${waiting} waiting for an earlier stage`]] : []), ...(flagged ? [['rose', `${flagged} with a part rejected earlier — fix here`]] : [])]}
                        total={gs.length} ok={n(x => x.status === 'APPROVED' || x.status === 'REPAIRED')} rework={rework} rejected={n(x => x.status === 'QC_REJECTED')} earlier={flagged} waiting={waiting}
                        left={n(x => !x.status && x.gate_ok && !x.flagged.length)} fixCount={rework + flagged}
                        onInspect={() => setInspect({ key: g.key })} onFix={() => setInspect({ key: g.key, fix: true })} />;
                })}
            </div>
            <p className="text-xs text-slate-500">A workstation set for one garment at a time (2.0) checks one garment per action.</p>
            {overlay}
        </div>
    );
}

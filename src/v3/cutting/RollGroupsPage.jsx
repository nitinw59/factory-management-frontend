// Roll grouping for an order (8 Nov 2026, owner: "after receiving fabric from fabric store cutting manager group roll based
// on shade or width"). Every roll received at cutting for the order: the cutting room's shade group (A, B … from the
// shade band; the dye lot stands in until it is set) and the measured width (the store's width until measured). The cut
// plan keeps a lay to one shade group and one width group (rolls within the tolerance of the narrowest) unless its rules
// allow mixing. Backend: cutPlansController.rollGroups / saveRollGroups; every change is kept in the roll's history.
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Save, Wand2 } from 'lucide-react';
import { cuttingApi } from '../api/cuttingApi';
import { apiError } from '../api/mastersApi';
import { PageHeader, inputCls, PrimaryButton, SecondaryButton, ErrorBox, Loading, SearchInput } from '../components/ui';
import { fmt } from './cutShared';

const CM = { in: 2.54, cm: 1 };
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const rowOf = (r) => ({ shade_group: r.shade_group || '', measured_width: r.measured_width == null ? '' : String(r.measured_width), width_unit: r.measured_width_unit || r.width_unit || 'in', notes: r.check_notes || '' });

export default function RollGroupsPage() {
    const { orderId } = useParams();
    const [d, setD] = useState(null);
    const [vals, setVals] = useState({});
    const [tol, setTol] = useState(2);
    const [sel, setSel] = useState({});
    const [bulk, setBulk] = useState('');
    const [q, setQ] = useState('');
    const [error, setError] = useState('');
    const [msg, setMsg] = useState('');
    const [busy, setBusy] = useState(false);
    const load = () => cuttingApi.rollGroups(orderId).then(res => { setD(res.data); setVals(Object.fromEntries(res.data.rolls.map(r => [r.id, rowOf(r)]))); setSel({}); }).catch(err => setError(apiError(err, 'Failed to load the rolls.')));
    useEffect(() => { load(); cuttingApi.planSettings().then(res => setTol(res.data.rules.width_tol_cm)).catch(() => {}); }, [orderId]); // eslint-disable-line react-hooks/exhaustive-deps
    const fabrics = useMemo(() => {
        if (!d) return [];
        const m = new Map();
        for (const r of d.rolls) { if (!m.has(r.fabric_item_id)) m.set(r.fabric_item_id, { id: r.fabric_item_id, label: r.fabric_label, support: r.support, rolls: [] }); m.get(r.fabric_item_id).rolls.push(r); }
        return [...m.values()];
    }, [d]);
    if (!d) return <div>{error ? <ErrorBox text={error} /> : <Loading />}</div>;
    const can = d.can.manage;
    const changed = d.rolls.filter(r => JSON.stringify(vals[r.id]) !== JSON.stringify(rowOf(r)));
    const set = (id, patch) => setVals(v => ({ ...v, [id]: { ...v[id], ...patch } }));
    const widthCm = (r) => { const v = vals[r.id]; const w = v?.measured_width !== '' ? Number(v.measured_width) : r.width; const u = v?.measured_width !== '' ? v.width_unit : r.width_unit; return w ? w * (CM[u] || 2.54) : null; };
    // Width groups per fabric, as the planner makes them: a new group past the narrowest + tolerance.
    const widthGroup = {};
    for (const f of fabrics) {
        const list = f.rolls.filter(r => widthCm(r) != null).sort((a, b) => widthCm(a) - widthCm(b));
        let n = 0; let start = null;
        for (const r of list) { const w = widthCm(r); if (start == null || w > start + tol + 1e-9) { n += 1; start = w; } widthGroup[r.id] = `W${n}`; }
    }
    const shadeOf = (r) => vals[r.id]?.shade_group || (r.dye_lot ? `Lot ${r.dye_lot}` : '—');
    // Suggest: per fabric, each dye lot a letter (only rolls with no shade group yet).
    const suggest = () => {
        const next = { ...vals };
        for (const f of fabrics) {
            const lots = [...new Set(f.rolls.map(r => r.dye_lot || ''))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
            for (const r of f.rolls) if (!next[r.id].shade_group) next[r.id] = { ...next[r.id], shade_group: LETTERS[lots.indexOf(r.dye_lot || '')] || '' };
        }
        setVals(next); setMsg('Shade groups filled from dye lots for rolls without one — check them against the shade band, then save.');
    };
    const save = async () => {
        setBusy(true); setError(''); setMsg('');
        try {
            const res = await cuttingApi.saveRollGroups(orderId, changed.map(r => ({ fabric_roll_id: r.id, ...vals[r.id] })));
            await load(); setMsg(`${res.data.changed} roll(s) saved.`);
        } catch (err) { setError(apiError(err, 'Failed to save.')); }
        finally { setBusy(false); }
    };
    const term = q.trim().toLowerCase();
    const shown = (r) => !term || `${r.roll_no} ${r.dye_lot || ''} ${vals[r.id]?.shade_group || ''}`.toLowerCase().includes(term);
    const picked = Object.keys(sel).filter(k => sel[k]);
    return (
        <div>
            <Link to="/v3/cutting" className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-indigo-600 mb-3"><ArrowLeft size={15} /> Cutting</Link>
            <PageHeader title={`Group rolls — ${d.order.order_no}`} subtitle={`${d.order.customer_name}. Rolls received at cutting: shade group from the shade band and the width as measured. A lay keeps to one shade group and one width group (within ${tol} cm).`} />
            <ErrorBox text={error} />
            {msg && <p className="mb-3 text-sm rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 px-3 py-2">{msg}</p>}
            {can && (
                <div className="flex flex-wrap items-center gap-2 mb-3">
                    <SearchInput value={q} onChange={setQ} placeholder="Roll, lot or group" />
                    <SecondaryButton disabled={busy} onClick={suggest}><Wand2 size={15} /> Fill from dye lots</SecondaryButton>
                    <span className="flex items-center gap-1 text-sm">
                        <input className={`${inputCls} !w-20 uppercase`} value={bulk} maxLength={10} onChange={e => setBulk(e.target.value.toUpperCase())} placeholder="A" aria-label="Shade group for the selected rolls" />
                        <SecondaryButton disabled={!picked.length || !bulk.trim()} onClick={() => { setVals(v => { const n = { ...v }; for (const id of picked) n[id] = { ...n[id], shade_group: bulk.trim() }; return n; }); setSel({}); }}>Set for {picked.length} selected</SecondaryButton>
                    </span>
                    <span className="ml-auto flex items-center gap-2">
                        {changed.length > 0 && <span className="text-xs font-semibold text-amber-700">{changed.length} unsaved</span>}
                        <PrimaryButton busy={busy} disabled={busy || !changed.length} onClick={save}><Save size={15} /> Save</PrimaryButton>
                    </span>
                </div>
            )}
            {fabrics.length === 0 && <p className="text-sm text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-6 text-center">No fabric received at cutting for this order yet.</p>}
            {fabrics.map(f => {
                const rolls = f.rolls.filter(shown);
                const groups = {};
                for (const r of f.rolls) { const k = `${shadeOf(r)} · ${widthGroup[r.id] || '—'}`; groups[k] = groups[k] || { rolls: 0, qty: 0, uom: r.uom }; groups[k].rolls += 1; groups[k].qty += r.net; }
                const allOn = rolls.length > 0 && rolls.every(r => sel[r.id]);
                return (
                    <section key={f.id} className="bg-white border border-slate-200 rounded-xl mb-4 overflow-x-auto">
                        <div className="px-4 pt-3 pb-2 flex flex-wrap items-baseline gap-2">
                            <h2 className="font-bold text-slate-800">{f.label}</h2>
                            {f.support && <span className="text-[11px] font-bold px-1.5 py-0.5 rounded border border-slate-300 text-slate-600">pocketing / lining</span>}
                            <span className="text-xs text-slate-500">{Object.entries(groups).map(([k, g]) => `${k}: ${g.rolls} roll${g.rolls === 1 ? '' : 's'}, ${fmt(g.qty, 2)} ${g.uom}`).join(' · ')}</span>
                        </div>
                        <table className="w-full text-sm min-w-[860px]">
                            <thead className="bg-slate-50 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                                <tr><th className="px-3 py-2 w-8">{can && <input type="checkbox" checked={allOn} onChange={e => setSel(s => { const n = { ...s }; for (const r of rolls) n[r.id] = e.target.checked; return n; })} aria-label="Select all rolls of this fabric" />}</th>
                                    <th className="px-3 py-2">Roll</th><th className="px-3 py-2">Dye lot</th><th className="px-3 py-2 text-right">At cutting</th><th className="px-3 py-2">Store width</th>
                                    <th className="px-3 py-2">Measured width</th><th className="px-3 py-2">Width group</th><th className="px-3 py-2">Shade group</th><th className="px-3 py-2">Notes</th><th className="px-3 py-2">Batch</th></tr>
                            </thead>
                            <tbody>
                                {rolls.map(r => {
                                    const v = vals[r.id];
                                    const dirty = JSON.stringify(v) !== JSON.stringify(rowOf(r));
                                    return (
                                        <tr key={r.id} className={`border-t border-slate-100 ${dirty ? 'bg-amber-50/50' : ''}`}>
                                            <td className="px-3 py-1.5">{can && <input type="checkbox" checked={Boolean(sel[r.id])} onChange={e => setSel(s => ({ ...s, [r.id]: e.target.checked }))} aria-label={`Select roll ${r.roll_no}`} />}</td>
                                            <td className="px-3 py-1.5 font-semibold">{r.roll_no}</td>
                                            <td className="px-3 py-1.5">{r.dye_lot || '—'}</td>
                                            <td className="px-3 py-1.5 text-right tabular-nums">{fmt(r.net, 2)} {r.uom}</td>
                                            <td className="px-3 py-1.5 text-slate-600">{r.width ? `${r.width} ${r.width_unit || ''}` : '—'}</td>
                                            <td className="px-3 py-1.5"><span className="flex gap-1">
                                                <input className={`${inputCls} !w-20 !py-1`} type="number" min="0" step="0.1" value={v.measured_width} disabled={!can} onChange={e => set(r.id, { measured_width: e.target.value })} aria-label={`Measured width of ${r.roll_no}`} />
                                                <select className={`${inputCls} !w-16 !py-1`} value={v.width_unit} disabled={!can} onChange={e => set(r.id, { width_unit: e.target.value })} aria-label="Width unit"><option value="in">in</option><option value="cm">cm</option></select></span></td>
                                            <td className="px-3 py-1.5 font-semibold text-slate-700">{widthGroup[r.id] || '—'}</td>
                                            <td className="px-3 py-1.5"><input className={`${inputCls} !w-20 !py-1 uppercase`} maxLength={10} value={v.shade_group} disabled={!can} placeholder={r.dye_lot ? `Lot ${r.dye_lot}` : ''} onChange={e => set(r.id, { shade_group: e.target.value.toUpperCase() })} aria-label={`Shade group of ${r.roll_no}`} /></td>
                                            <td className="px-3 py-1.5"><input className={`${inputCls} !py-1`} value={v.notes} disabled={!can} onChange={e => set(r.id, { notes: e.target.value })} aria-label={`Notes on ${r.roll_no}`} /></td>
                                            <td className="px-3 py-1.5 text-xs text-slate-500">{r.on_batch ? `#${r.on_batch}` : '—'}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                            <tfoot className="border-t-2 border-slate-200 bg-slate-50 text-xs font-bold text-slate-700">
                                <tr><td className="px-3 py-2" /><td className="px-3 py-2" colSpan={2}>Total {rolls.length}{rolls.length !== f.rolls.length ? ` of ${f.rolls.length}` : ''} roll{f.rolls.length === 1 ? '' : 's'}</td>
                                    <td className="px-3 py-2 text-right tabular-nums">{fmt(rolls.reduce((s, r) => s + r.net, 0), 2)} {f.rolls[0]?.uom}</td><td colSpan={6} /></tr>
                            </tfoot>
                        </table>
                    </section>
                );
            })}
        </div>
    );
}

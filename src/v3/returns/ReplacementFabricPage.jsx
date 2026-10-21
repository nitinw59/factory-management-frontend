// Fabric for material replacements (21 Oct 2026, docs/PRODUCTION_V3_PLAN.md → "Material replacement after returns"):
// the cutting room has no end bit or roll for a replacement panel and asks the fabric store for fabric. The store
// issues one whole roll to the order's cutting on an MI3 slip — the order's own roll, else a remnant (the order's
// returned end bits first), else free stock beyond the allocation (it counts in the order's consumption).
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PackageCheck } from 'lucide-react';
import Modal from '../../shared/Modal';
import { productionApi } from '../api/productionApi';
import { apiError } from '../api/mastersApi';
import { PageHeader, PrimaryButton, SecondaryButton, ErrorBox, Loading } from '../components/ui';
import { useV3Live } from '../live';

const TABS = [['OPEN', 'To issue'], ['ISSUED', 'Issued'], ['CANCELLED', 'Cancelled']];
const KIND = { ORDER: ['The order\'s roll', 'bg-emerald-50 text-emerald-800 border-emerald-300'], REMNANT: ['Remnant', 'bg-indigo-50 text-indigo-800 border-indigo-300'], FREE: ['Free stock — beyond the allocation', 'bg-amber-50 text-amber-800 border-amber-300'] };
const fmt = (n) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 3 });
const when = (d) => (d ? new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');

function IssueModal({ req, onClose, onDone }) {
    const [rolls, setRolls] = useState(null);
    const [pick, setPick] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    useEffect(() => { productionApi.replacementFabricRolls(req.id).then(r => { setRolls(r.data); const first = r.data.find(x => x.covers); setPick(first ? first.id : ''); }).catch(err => setError(apiError(err, 'Failed to load the rolls.'))); }, [req.id]);
    const chosen = rolls?.find(r => r.id === pick);
    const issue = async () => {
        setBusy(true); setError('');
        try { const r = await productionApi.issueReplacementFabric(req.id, pick); onDone(`Roll ${r.data.roll_no} (${fmt(r.data.qty)} ${r.data.uom}) issued to cutting for ${req.order_no} on ${r.data.issue_no}${r.data.beyond_allocation ? ' — beyond the allocation, from free stock' : ''}.`); }
        catch (err) { setError(apiError(err, 'Failed.')); setBusy(false); }
    };
    return (
        <Modal title={`Issue fabric — ${req.order_no}`} onClose={onClose}>
            <div className="w-[min(620px,92vw)] space-y-3">
                <p className="text-sm text-slate-700"><b>{fmt(req.metres)} {req.uom}</b> of {req.fabric_label}{req.colour ? ` · ${req.colour}` : ''} for {req.part_name} {req.size} ({req.uid}), batch #{req.floor_no}. A whole roll goes to the order's cutting; what is left becomes the order's end bits.</p>
                <ErrorBox text={error} />
                {!rolls ? (!error && <Loading />) : rolls.length === 0 ? <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">No roll of this fabric is in stock (free or held by this order). Raise a requisition to buy it.</p> : (
                    <div className="space-y-1.5 max-h-[50vh] overflow-y-auto">{rolls.map(r => (
                        <label key={r.id} className={`flex items-center gap-3 px-3 py-2 rounded-lg border-2 cursor-pointer ${pick === r.id ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 bg-white'}`}>
                            <input type="radio" name="roll" checked={pick === r.id} onChange={() => setPick(r.id)} className="w-4 h-4" />
                            <span className="flex-1"><b className="text-slate-800">Roll {r.roll_no}</b> · {fmt(r.qty)} {req.uom}{r.dye_lot ? <span className="text-xs text-slate-500"> · lot {r.dye_lot}</span> : null}
                                {!r.covers && <span className="block text-xs text-rose-700">shorter than the {fmt(req.metres)} {req.uom} asked</span>}</span>
                            <span className={`text-[10px] font-black px-1.5 py-0.5 rounded border ${KIND[r.kind][1]}`}>{KIND[r.kind][0]}</span>
                        </label>
                    ))}</div>
                )}
                {chosen?.kind === 'FREE' && <p className="text-xs text-amber-800">This roll is not allocated to the order: it is issued beyond the allocation, from free stock, and counts in the order's fabric consumption.</p>}
                <div className="flex justify-end gap-2"><SecondaryButton onClick={onClose}>Back</SecondaryButton><PrimaryButton onClick={issue} busy={busy} disabled={busy || !pick}><PackageCheck size={14} /> Issue roll</PrimaryButton></div>
            </div>
        </Modal>
    );
}

export default function ReplacementFabricPage() {
    const [tab, setTab] = useState('OPEN');
    const [rows, setRows] = useState(null);
    const [error, setError] = useState('');
    const [msg, setMsg] = useState('');
    const [issue, setIssue] = useState(null);
    const load = useCallback(() => productionApi.replacementFabric(tab).then(r => setRows(r.data)).catch(err => setError(apiError(err, 'Failed to load.'))), [tab]);
    useEffect(() => { load(); }, [load]);
    useV3Live(load);
    return (
        <div>
            <PageHeader title="Fabric for replacements" subtitle="The cutting room needs fabric for a material replacement and has no end bit or roll for it. Issue one whole roll to the order's cutting — the order's own roll, else a remnant, else free stock beyond the allocation (it counts in the order's consumption)." />
            <div className="flex flex-wrap items-center gap-1 mb-3 border-b border-slate-200">
                {TABS.map(([k, label]) => <button key={k} type="button" onClick={() => setTab(k)} className={`px-3 py-2 text-sm font-bold border-b-2 -mb-px ${tab === k ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>{label}</button>)}
            </div>
            <ErrorBox text={error} />
            {msg && <p className="mb-3 text-sm font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">{msg}</p>}
            {!rows ? <Loading /> : rows.length === 0 ? <p className="text-sm text-slate-500 bg-white border border-slate-200 rounded-xl p-6 text-center">Nothing here.</p> : (
                <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
                    <table className="w-full text-sm min-w-[900px]">
                        <thead className="bg-slate-50 text-left text-xs font-bold text-slate-500 uppercase tracking-wider"><tr>
                            <th className="px-3 py-2">Order · batch</th><th className="px-3 py-2">Piece</th><th className="px-3 py-2">Fabric · colour</th><th className="px-3 py-2 text-right">Needed</th><th className="px-3 py-2">Asked</th><th className="px-3 py-2">{tab === 'OPEN' ? '' : tab === 'ISSUED' ? 'Issued' : 'Cancelled'}</th></tr></thead>
                        <tbody>{rows.map(x => (
                            <tr key={x.id} className="border-t border-slate-100">
                                <td className="px-3 py-2"><b>{x.order_no}</b><span className="block text-xs text-slate-500">{x.customer_name} · #{x.floor_no} {x.batch_code}</span></td>
                                <td className="px-3 py-2">{x.part_name} · {x.size}<span className="block text-xs text-slate-500">{x.uid} · {x.stage}</span></td>
                                <td className="px-3 py-2">{x.fabric_label}{x.colour ? <span className="text-slate-500"> · {x.colour}</span> : null}</td>
                                <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap"><b>{fmt(x.metres)}</b> {x.uom}</td>
                                <td className="px-3 py-2 text-xs text-slate-600">{x.requested_by_name || '—'} · {when(x.created_at)}{x.note ? <span className="block">“{x.note}”</span> : null}</td>
                                <td className="px-3 py-2 text-xs">
                                    {x.status === 'OPEN' ? <PrimaryButton onClick={() => { setMsg(''); setIssue(x); }}>Issue a roll…</PrimaryButton>
                                        : x.status === 'ISSUED' ? <>Roll <b>{x.roll_no}</b> · <Link className="text-indigo-700 hover:underline" to={`/v3/material-issue/issues/${x.issue_id}`}>{x.issue_no}</Link>{x.beyond_allocation ? <span className="block text-amber-700 font-semibold">beyond the allocation</span> : null}<span className="block text-slate-500">{x.issued_by_name} · {when(x.issued_at)}</span></>
                                            : <span className="text-slate-500">{x.cancelled_reason}</span>}
                                </td>
                            </tr>
                        ))}</tbody>
                    </table>
                </div>
            )}
            {issue && <IssueModal req={issue} onClose={() => setIssue(null)} onDone={(m) => { setIssue(null); setMsg(m); load(); }} />}
        </div>
    );
}

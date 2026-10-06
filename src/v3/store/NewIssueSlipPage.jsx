// New store issue slip: to a person (app user or employee), a machine or a
// department — picked from the 2.0 lists; optional department to charge;
// purpose; salary recovery (person only); items with quantity (stock shown).
// Goes out at the average cost; the number is given on save.
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Trash2, PackageMinus } from 'lucide-react';
import { storeApi } from '../api/storeApi';
import { apiError } from '../api/mastersApi';
import { PageHeader, Field, inputCls, PrimaryButton, ErrorBox } from '../components/ui';
import { todayLocal } from '../salesOrders/SalesOrderStatusBadge';
import StoreItemPicker from './StoreItemPicker';
import { TARGET_LABEL, inr, fmt } from './storeShared';

export default function NewIssueSlipPage() {
    const navigate = useNavigate();
    const [type, setType] = useState('PERSON');
    const [q, setQ] = useState('');
    const [options, setOptions] = useState([]);
    const [target, setTarget] = useState(null);
    const [depts, setDepts] = useState([]);
    const [deptId, setDeptId] = useState('');
    const [purpose, setPurpose] = useState('');
    const [recover, setRecover] = useState(false);
    const [date, setDate] = useState(todayLocal());
    const [lines, setLines] = useState([]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => { storeApi.issueTargets('DEPARTMENT', '').then(res => setDepts(res.data)).catch(() => {}); }, []);
    useEffect(() => {
        if (type === 'DEPARTMENT') { setOptions([]); return undefined; }
        const t = setTimeout(() => storeApi.issueTargets(type, q.trim()).then(res => setOptions(res.data)).catch(err => setError(apiError(err, 'Failed to search.'))), 250);
        return () => clearTimeout(t);
    }, [type, q]);

    const pickType = (t) => { setType(t); setTarget(null); setQ(''); setRecover(false); setDeptId(''); };
    const valid = lines.length > 0 && lines.every(l => Number(l.qty) > 0) && (type === 'DEPARTMENT' ? deptId : target);
    const value = lines.reduce((s, l) => s + Number(l.qty || 0) * l.item.avg_cost, 0);
    const save = async () => {
        setBusy(true); setError('');
        const body = { target_type: type, issue_date: date, department_id: deptId || undefined, purpose, recover_from_salary: recover,
            lines: lines.map(l => ({ store_item_id: l.item.id, qty: Number(l.qty), notes: l.notes })) };
        if (type === 'PERSON') body[target.kind === 'USER' ? 'user_id' : 'employee_id'] = target.id;
        if (type === 'MACHINE') body.asset_id = target.id;
        try { const res = await storeApi.createIssue(body); navigate(`/v3/store/issues/${res.data.id}`); } catch (err) { setError(apiError(err, 'Failed to save the slip.')); setBusy(false); }
    };

    return (
        <div>
            <Link to="/v3/store/issues" className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-indigo-600 mb-3"><ArrowLeft size={15} /> Issue slips</Link>
            <PageHeader title="New issue slip" subtitle="Items go out of the store at their average cost. Unused items can be returned on the slip later." />
            <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4 space-y-3">
                <div className="flex flex-wrap gap-2">
                    {Object.entries(TARGET_LABEL).map(([k, v]) => (
                        <button key={k} type="button" onClick={() => pickType(k)} className={`px-3 py-1.5 text-sm font-semibold rounded-lg border ${type === k ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-700 border-slate-300'}`}>To a {v.toLowerCase()}</button>
                    ))}
                </div>
                {type !== 'DEPARTMENT' && (
                    target ? (
                        <p className="text-sm"><b>{target.name}</b> <span className="text-slate-500">{target.detail}</span> <button type="button" className="ml-2 text-indigo-700 font-semibold" onClick={() => setTarget(null)}>change</button></p>
                    ) : (
                        <div>
                            <input className={inputCls} value={q} onChange={e => setQ(e.target.value)} placeholder={type === 'PERSON' ? 'Search app users and employees' : 'Search machine: QR id, name, line'} autoFocus />
                            <div className="mt-1 max-h-60 overflow-y-auto border border-slate-100 rounded-lg">
                                {options.length === 0 && <p className="px-3 py-2 text-sm text-slate-400">No matches.</p>}
                                {options.map(o => (
                                    <button key={`${o.kind}${o.id}`} type="button" className="block w-full text-left px-3 py-1.5 text-sm hover:bg-indigo-50"
                                        onClick={() => { setTarget(o); if (o.department_id) setDeptId(o.department_id); }}>
                                        <span className="font-semibold">{o.name}</span> <span className="text-xs text-slate-500">{o.detail}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )
                )}
                <div className="grid sm:grid-cols-4 gap-3">
                    <Field label={type === 'DEPARTMENT' ? 'Department *' : 'Charge to department'}>
                        <select className={inputCls} value={deptId} onChange={e => setDeptId(e.target.value)}><option value="">{type === 'DEPARTMENT' ? 'Choose…' : '—'}</option>{depts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
                    </Field>
                    <div className="sm:col-span-2"><Field label="Purpose"><input className={inputCls} value={purpose} onChange={e => setPurpose(e.target.value)} placeholder="Needle change on line 2, pantry stock…" /></Field></div>
                    <Field label="Date"><input className={inputCls} type="date" max={todayLocal()} value={date} onChange={e => setDate(e.target.value)} /></Field>
                </div>
                {type === 'PERSON' && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={recover} onChange={e => setRecover(e.target.checked)} /> Recover the value from this person's salary</label>}
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4">
                <p className="text-xs font-black uppercase tracking-wider text-slate-500 mb-2">Items</p>
                <StoreItemPicker exclude={lines.map(l => String(l.item.id))} onPick={(item) => setLines([...lines, { item, qty: '', notes: '' }])} />
                {lines.length > 0 && (
                    <table className="w-full text-sm mt-3">
                        <thead className="text-left text-xs text-slate-500"><tr><th className="py-1">Item</th><th className="py-1 text-right">In stock</th><th className="py-1 w-32">Quantity</th><th className="py-1">Note</th><th className="py-1 text-right">Value ₹</th><th className="w-8" /></tr></thead>
                        <tbody>
                            {lines.map((l, i) => {
                                const over = Number(l.qty) > l.item.on_hand;
                                return (
                                    <tr key={l.item.id} className="border-t border-slate-100">
                                        <td className="py-1.5 font-semibold">{l.item.label}</td>
                                        <td className={`py-1.5 text-right tabular-nums ${over ? 'text-rose-700 font-bold' : ''}`}>{fmt(l.item.on_hand, l.item.usage_uom)} {l.item.usage_uom}</td>
                                        <td className="py-1.5"><input className={`${inputCls} !py-1`} type="number" min="0" step="any" value={l.qty} onChange={e => setLines(lines.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)))} aria-label={`Quantity of ${l.item.label}`} /></td>
                                        <td className="py-1.5 pl-2"><input className={`${inputCls} !py-1`} value={l.notes} onChange={e => setLines(lines.map((x, j) => (j === i ? { ...x, notes: e.target.value } : x)))} aria-label="Note" /></td>
                                        <td className="py-1.5 text-right tabular-nums">{inr(Number(l.qty || 0) * l.item.avg_cost)}</td>
                                        <td className="py-1.5 text-right"><button type="button" className="p-1 text-rose-500" aria-label="Remove" onClick={() => setLines(lines.filter((_, j) => j !== i))}><Trash2 size={14} /></button></td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>
            <ErrorBox text={error} />
            <PrimaryButton onClick={save} busy={busy} disabled={busy || !valid}><PackageMinus size={15} /> Issue · ₹{inr(value)}</PrimaryButton>
        </div>
    );
}

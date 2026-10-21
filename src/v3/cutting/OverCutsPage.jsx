// Over-cut (20 Oct 2026, docs/PRODUCTION_V3_PLAN.md → "Over-cut and trims"): batches cut above the order. The
// merchandiser approves the trims for garments above the free limit (handed from free stock) or refuses them (the
// garments are written off). Within the limit no approval is needed — listed for the record.
import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { cuttingApi } from '../api/cuttingApi';
import { apiError } from '../api/mastersApi';
import { PageHeader, ErrorBox, Loading } from '../components/ui';
import { useCuttingPermissions } from './cutShared';
import { OverStatus, OverCutCells, DecideOverCut } from './overCutShared';

const TABS = [['PENDING', 'Waiting'], ['APPROVED,REFUSED', 'Decided'], ['WITHIN', 'Within the limit'], ['', 'All']];

export default function OverCutsPage() {
    const perms = useCuttingPermissions();
    const [sp, setSp] = useSearchParams();
    const tab = sp.get('status') ?? 'PENDING';
    const [rows, setRows] = useState(null);
    const [error, setError] = useState('');
    const load = useCallback(() => cuttingApi.overCuts(tab ? { status: tab } : {}).then(r => setRows(r.data)).catch(err => setError(apiError(err, 'Failed to load.'))), [tab]);
    useEffect(() => { setRows(null); load(); }, [load]);
    return (
        <div>
            <PageHeader title="Over-cut" subtitle="Garments cut above the order. Up to 1 % of the ordered quantity per colour × size needs no approval; above it the merchandiser approves their trims (from free stock) or they are written off." />
            <div className="flex flex-wrap gap-1 mb-3">{TABS.map(([k, label]) => (
                <button key={label} type="button" onClick={() => setSp(k === 'PENDING' ? {} : { status: k })}
                    className={`px-3 py-1.5 rounded-lg text-sm font-bold ${tab === k ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>{label}</button>
            ))}</div>
            <ErrorBox text={error} />
            {!rows ? (!error && <Loading />) : rows.length === 0 ? <p className="text-sm text-slate-500 bg-white border border-slate-200 rounded-xl p-4">Nothing here.</p> : rows.map(x => (
                <div key={x.batch_id} className="bg-white border border-slate-200 rounded-xl p-4 mb-3">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                        <Link to={`/v3/cutting/batches/${x.batch_id}`} className="font-black text-indigo-700 hover:underline">#{x.floor_no} {x.batch_code}</Link>
                        <OverStatus s={x.status} />
                        <span className="text-sm text-slate-500">{x.order_no} · line {x.line_no} {x.style_code} · {x.customer_name}</span>
                        {perms.over_cut && x.status === 'PENDING' && <span className="ml-auto"><DecideOverCut batchId={x.batch_id} onDone={load} compact /></span>}
                    </div>
                    <p className="text-sm text-slate-700 mb-2"><b>{x.free_garments}</b> within {x.free_pct} %{x.approval_garments ? <> · <b className="text-rose-700">{x.approval_garments}</b> above the limit</> : ''}{x.cut_reason ? <> · cutting: <i>{x.cut_reason}</i>{x.created_by_name ? ` (${x.created_by_name})` : ''}</> : ''}</p>
                    <OverCutCells cells={x.cells} />
                    {x.decision_note && <p className="text-xs text-slate-600 mt-2">{x.status === 'REFUSED' ? 'Refused' : 'Approved'}: <i>{x.decision_note}</i>{x.decided_by_name ? ` — ${x.decided_by_name}` : ''}</p>}
                </div>
            ))}
        </div>
    );
}

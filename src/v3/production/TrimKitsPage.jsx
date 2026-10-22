// Trim kits (2.0's trim orders): a kit is made for each cut batch when it is finalised (19 Oct 2026, phase 5 — Order BOM
// × garments cut; the store can't change it); the store prepares it and marks it ready; the line
// loader picks them up — counts and signs, which issues them (an issue slip). Line loaders land on "Ready for
// pickup"; the store on everything open.
// 21 Oct 2026: "Pending to fulfil" — kit lines the store couldn't put in (not in stock / damaged / count short), per item
// with the stock now; "Extra lines" — the store's requests to hand another item from free stock (the merchandiser approves).
import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { trimKitsApi } from '../api/trimKitsApi';
import { apiError } from '../api/mastersApi';
import { useV3Live } from '../live';
import { PageHeader, SearchInput, ErrorBox, Loading } from '../components/ui';
import { KIT_STATUS, ACTION, SHORT_REASON, qty } from './trimKitShared';

const TABS = [
    ['READY', 'Ready for pickup'],
    ['DRAFT', 'To prepare'],
    ['PARTLY_ISSUED', 'Handed in part'],
    ['ISSUED,CLOSED,CANCELLED', 'Done'],
    ['', 'All'],
    ['pending', 'Pending to fulfil'],
    ['extra', 'Extra lines'],
];

export default function TrimKitsPage() {
    const [params, setParams] = useSearchParams();
    const [perm, setPerm] = useState(null);
    const status = params.get('status') ?? null;
    const [rows, setRows] = useState(null);
    const [search, setSearch] = useState('');
    const [error, setError] = useState('');
    useEffect(() => { trimKitsApi.permissions().then(res => setPerm(res.data)).catch(() => setPerm({ prepare: false, sign: false })); }, []);
    // Default tab: the store sees what it is preparing, the line loader what is ready.
    const tab = status ?? (perm && perm.prepare ? 'DRAFT' : perm && perm.approve_extra ? 'extra' : 'READY');
    const go = (k) => { setRows(null); setParams({ status: k }); };
    const [extraStatus, setExtraStatus] = useState('PENDING');
    const load = useCallback(() => {
        if (!perm) return;
        setError('');
        if (tab === 'pending') { trimKitsApi.pending().then(res => setRows(res.data)).catch(err => setError(apiError(err, 'Failed to load.'))); return; }
        if (tab === 'extra') { trimKitsApi.extraRequests(extraStatus).then(res => setRows(res.data)).catch(err => setError(apiError(err, 'Failed to load.'))); return; }
        trimKitsApi.list({ status: tab || undefined, q: search.trim() || undefined }).then(res => setRows(res.data)).catch(err => setError(apiError(err, 'Failed to load trim kits.')));
    }, [perm, tab, search, extraStatus]);
    useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [load]);
    useV3Live(load);

    return (
        <div>
            <PageHeader title="Trim kits" subtitle="One kit per cut batch, made when the batch is finalised (Order BOM × garments cut). The store prepares it and marks it ready; the line loader counts and signs — that issues it (an issue slip). Threads go by the cone and come back in metres."
                actions={<>
                    <SearchInput value={search} onChange={setSearch} placeholder="Kit, order, batch, customer" />
                </>} />
            <div className="flex flex-wrap gap-1 mb-3 border-b border-slate-200">
                {TABS.filter(([k]) => k !== 'pending' || perm?.prepare).map(([k, label]) => (
                    <button key={label} type="button" onClick={() => go(k)}
                        className={`px-3 py-2 text-sm font-bold border-b-2 -mb-px ${tab === k ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>{label}</button>
                ))}
            </div>
            <ErrorBox text={error} />
            {tab === 'pending' ? (!rows || Array.isArray(rows) ? <Loading /> : <PendingView data={rows} />)
            : tab === 'extra' ? (!Array.isArray(rows) ? <Loading /> : <ExtraView rows={rows} status={extraStatus} setStatus={(v) => { setRows(null); setExtraStatus(v); }} />)
            : !Array.isArray(rows) ? <Loading /> : rows.length === 0 ? (
                <p className="text-sm text-slate-500 bg-white border border-slate-200 rounded-xl p-6 text-center">{tab === 'READY' ? 'No kit is waiting for pickup.' : 'No kits here.'}</p>
            ) : (
                <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
                    {rows.map(k => (
                        <Link key={k.id} to={`/v3/trim-kits/${k.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 hover:bg-slate-50">
                            <b className="text-slate-900">{k.kit_no}</b>
                            <span className={`text-[11px] font-black px-2 py-0.5 rounded border ${KIT_STATUS[k.status].cls}`}>{KIT_STATUS[k.status].label}</span>
                            <span className="text-sm text-slate-700">{k.floor_no ? <b className="mr-1">#{k.floor_no}</b> : null}{k.order_no}{k.batch_code ? ` · ${k.batch_code}` : ''}</span>
                            <span className="text-xs text-slate-500">{k.customer_name} · {k.line_count} item(s){k.status === 'PARTLY_ISSUED' ? ` · ${k.open_lines} still to hand` : ''}</span>
                            {k.last_action === 'SENT_BACK' && <span className="basis-full text-xs font-semibold text-rose-700">{ACTION.SENT_BACK}: {k.last_reason}</span>}
                            <span className="ml-auto text-xs text-slate-500">{k.status === 'READY' && k.ready_at ? `ready ${new Date(k.ready_at).toLocaleString()}${k.ready_by_name ? ` · ${k.ready_by_name}` : ''}` : new Date(k.created_at).toLocaleDateString()}</span>
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
}

// Pending to fulfil: per item — on hand / free now, and every kit line still owed after a short pick.
function PendingView({ data }) {
    if (!data.items.length) return <p className="text-sm text-slate-500 bg-white border border-slate-200 rounded-xl p-6 text-center">Nothing pending — every kit got what it owed.</p>;
    const total = data.items.reduce((a, i) => a + i.lines.length, 0);
    return (
        <div className="space-y-3">
            <p className="text-sm text-slate-600">{data.lines} kit line(s) wait for stock{data.can_fill ? <> — <b className="text-emerald-700">{data.can_fill} can be filled now</b> (open the kit and put the rest in)</> : ''}. An order line fills from the order's allocation; an over-cut or extra line from free stock.</p>
            {data.items.map(i => (
                <div key={i.item_id} className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 bg-slate-50 border-b border-slate-200 text-sm">
                        <b className="text-slate-900">{i.label}</b>
                        <span className="text-slate-600">on hand <b>{qty(i.on_hand, i.uom)}</b> · free <b>{qty(i.free, i.uom)}</b> {i.uom}</span>
                        <span className="ml-auto text-amber-800 font-semibold">owed {qty(i.owed, i.uom)} {i.uom}</span>
                    </div>
                    <table className="w-full text-sm min-w-[760px]">
                        <thead className="text-xs font-bold text-slate-500 uppercase"><tr><th className="px-3 py-1.5 text-left">Kit</th><th className="px-3 py-1.5 text-left">Order · batch</th><th className="px-3 py-1.5 text-right">Owed</th><th className="px-3 py-1.5 text-left">Why short</th><th className="px-3 py-1.5 text-left">Since</th><th className="px-3 py-1.5 text-left">Now</th></tr></thead>
                        <tbody>
                            {i.lines.map(l => (
                                <tr key={l.kit_line_id} className="border-t border-slate-100">
                                    <td className="px-3 py-1.5"><Link to={`/v3/trim-kits/${l.kit_id}`} className="font-bold text-indigo-700 hover:underline">{l.kit_no}</Link> <span className="text-[11px] text-slate-500">{KIT_STATUS[l.kit_status]?.label}</span></td>
                                    <td className="px-3 py-1.5">{l.order_no}{l.floor_no ? ` · #${l.floor_no}` : ''}{l.part !== 'ORDER' && <span className="ml-1 text-[11px] text-sky-700">{l.part === 'EXTRA' ? 'extra line' : 'over-cut'} · free stock</span>}</td>
                                    <td className="px-3 py-1.5 text-right tabular-nums font-semibold">{qty(l.owed, l.uom)} {l.uom}</td>
                                    <td className="px-3 py-1.5 text-xs">{SHORT_REASON[l.reason] || l.reason}{l.note ? ` — ${l.note}` : ''}{l.picked_by_name ? <span className="text-slate-500"> · {l.picked_by_name}</span> : null}</td>
                                    <td className="px-3 py-1.5 text-xs text-slate-500">{new Date(l.since).toLocaleDateString('en-IN')}</td>
                                    <td className="px-3 py-1.5 text-xs">{l.extra_pending ? <span className="text-violet-700 font-semibold">extra line asked</span> : l.can_fill ? <span className="text-emerald-700 font-bold">can fill now</span> : <span className="text-slate-500">waiting for stock</span>}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ))}
            <p className="text-xs text-slate-500 text-right">{total} line(s) · {data.items.length} item(s)</p>
        </div>
    );
}

// Extra lines: the store's requests to hand another item from free stock for a line it can't hand — the merchandiser decides on the kit.
function ExtraView({ rows, status, setStatus }) {
    return (
        <div>
            <div className="flex gap-2 mb-2 text-sm">{[['PENDING', 'Waiting'], ['APPROVED', 'Approved'], ['REFUSED', 'Refused'], ['ALL', 'All']].map(([k, lab]) => (
                <button key={k} type="button" onClick={() => setStatus(k)} className={`px-2.5 py-1 rounded-full border text-xs font-bold ${status === k ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-300'}`}>{lab}</button>))}</div>
            {rows.length === 0 ? <p className="text-sm text-slate-500 bg-white border border-slate-200 rounded-xl p-6 text-center">No extra line requests here.</p> : (
                <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
                    <table className="w-full text-sm min-w-[860px]">
                        <thead className="text-xs font-bold text-slate-500 uppercase bg-slate-50"><tr><th className="px-3 py-2 text-left">Kit</th><th className="px-3 py-2 text-left">Instead of</th><th className="px-3 py-2 text-left">Extra line (free stock)</th><th className="px-3 py-2 text-left">Why</th><th className="px-3 py-2 text-left">Status</th></tr></thead>
                        <tbody>
                            {rows.map(r => (
                                <tr key={r.id} className="border-t border-slate-100 align-top">
                                    <td className="px-3 py-2"><Link to={`/v3/trim-kits/${r.kit_id}`} className="font-bold text-indigo-700 hover:underline">{r.kit_no}</Link><span className="block text-xs text-slate-500">{r.order_no}{r.floor_no ? ` · #${r.floor_no}` : ''} · {r.customer_name}</span></td>
                                    <td className="px-3 py-2">{r.replaces_label}<span className="block text-xs text-amber-800">{qty(r.replaces_owed, r.replaces_uom)} {r.replaces_uom} owed</span></td>
                                    <td className="px-3 py-2 font-semibold">{r.label}<span className="block text-xs font-normal">{qty(r.qty, r.uom)} {r.uom}</span></td>
                                    <td className="px-3 py-2 text-xs">{r.reason}<span className="block text-slate-500">{r.requested_by_name} · {new Date(r.created_at).toLocaleString('en-IN')}</span></td>
                                    <td className="px-3 py-2 text-xs"><b>{r.status.toLowerCase()}</b>{r.decided_by_name ? <span className="block text-slate-500">{r.decided_by_name}{r.decision_note ? ` — ${r.decision_note}` : ''}</span> : null}</td>
                                </tr>
                            ))}
                            <tr className="border-t-2 border-slate-200 bg-slate-50 text-xs font-bold"><td className="px-3 py-2" colSpan={5}>{rows.length} request(s){status === 'PENDING' ? ' — open the kit to approve or refuse' : ''}</td></tr>
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

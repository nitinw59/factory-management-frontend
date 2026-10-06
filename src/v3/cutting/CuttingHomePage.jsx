// Cutting: order lines to cut (planned vs cut, fabric issued to cutting) and the cut batches.
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { cuttingApi } from '../api/cuttingApi';
import { apiError } from '../api/mastersApi';
import { PageHeader, SearchInput, ErrorBox, Loading } from '../components/ui';
import { fmtDate } from '../salesOrders/SalesOrderStatusBadge';
import { CUT_STATUS, fmt, useCuttingPermissions } from './cutShared';

export default function CuttingHomePage() {
    const perms = useCuttingPermissions();
    const [params, setParams] = useSearchParams();
    const tab = params.get('tab') === 'batches' ? 'batches' : 'orders';
    const [lines, setLines] = useState(null);
    const [batches, setBatches] = useState(null);
    const [status, setStatus] = useState('');
    const [search, setSearch] = useState('');
    const [error, setError] = useState('');
    useEffect(() => { cuttingApi.orders().then(res => setLines(res.data)).catch(err => setError(apiError(err, 'Failed to load orders.'))); }, []);
    useEffect(() => {
        if (tab !== 'batches') return undefined;
        const t = setTimeout(() => cuttingApi.batches({ status: status || undefined, q: search.trim() || undefined }).then(res => setBatches(res.data)).catch(err => setError(apiError(err, 'Failed to load batches.'))), 250);
        return () => clearTimeout(t);
    }, [tab, status, search]);
    return (
        <div>
            <PageHeader title="Cutting" subtitle="Cut batches per order line: the cutting manager sets the size ratio and layer length, picks rolls issued to cutting; the cutter enters lays per roll." />
            <div className="flex gap-1 mb-3 border-b border-slate-200">
                {[['orders', 'Orders to cut'], ['batches', 'Cut batches']].map(([k, v]) => <button key={k} type="button" onClick={() => setParams(k === 'orders' ? {} : { tab: k })} className={`px-3 py-2 text-sm font-semibold border-b-2 -mb-px ${tab === k ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500'}`}>{v}</button>)}
            </div>
            <ErrorBox text={error} />
            {tab === 'orders' && (!lines ? <Loading /> : (
                <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
                    <table className="w-full text-sm min-w-[820px]">
                        <thead className="bg-slate-50 text-left text-xs font-bold text-slate-500 uppercase tracking-wider"><tr><th className="px-3 py-2.5">Order / line</th><th className="px-3 py-2.5">Style</th><th className="px-3 py-2.5">Ships</th><th className="px-3 py-2.5 text-right">Ordered</th><th className="px-3 py-2.5 text-right">Cut</th><th className="px-3 py-2.5 text-right">Fabric at cutting</th><th className="px-3 py-2.5 text-right">Batches</th><th /></tr></thead>
                        <tbody>
                            {lines.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">No approved orders.</td></tr>}
                            {lines.map(l => (
                                <tr key={l.line_id} className="border-t border-slate-100">
                                    <td className="px-3 py-2.5 font-semibold">{l.order_no} <span className="text-xs text-slate-500">line {l.line_no}</span><span className="block text-xs font-normal text-slate-500">{l.customer_name}</span></td>
                                    <td className="px-3 py-2.5">{l.style_code} <span className="text-xs text-slate-500">{l.style_name}</span></td>
                                    <td className="px-3 py-2.5 whitespace-nowrap">{fmtDate(l.ship_date)}</td>
                                    <td className="px-3 py-2.5 text-right tabular-nums">{l.ordered}</td>
                                    <td className={`px-3 py-2.5 text-right tabular-nums font-bold ${l.cut >= l.ordered && l.ordered ? 'text-emerald-700' : ''}`}>{l.cut}</td>
                                    <td className="px-3 py-2.5 text-right tabular-nums">{l.fabric_issued_m ? `${fmt(l.fabric_issued_m)} m` : '—'}</td>
                                    <td className="px-3 py-2.5 text-right tabular-nums">{l.batches}</td>
                                    <td className="px-3 py-2.5 text-right whitespace-nowrap">{perms.manage && <Link to={`/v3/cutting/lines/${l.line_id}/new`} className="text-sm font-semibold text-indigo-700 hover:underline">New batch →</Link>}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ))}
            {tab === 'batches' && (
                <>
                    <div className="flex flex-wrap gap-2 mb-3">
                        <SearchInput value={search} onChange={setSearch} placeholder="Batch, style, customer" />
                        <select className="px-3 py-2 text-sm border border-slate-300 rounded-lg" value={status} onChange={e => setStatus(e.target.value)} aria-label="Status"><option value="">All</option>{Object.entries(CUT_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
                    </div>
                    {!batches ? <Loading /> : (
                        <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
                            <table className="w-full text-sm min-w-[760px]">
                                <thead className="bg-slate-50 text-left text-xs font-bold text-slate-500 uppercase tracking-wider"><tr><th className="px-3 py-2.5">Batch</th><th className="px-3 py-2.5">Style</th><th className="px-3 py-2.5">Status</th><th className="px-3 py-2.5 text-right">Rolls cut</th><th className="px-3 py-2.5 text-right">Pieces</th><th className="px-3 py-2.5">Created</th></tr></thead>
                                <tbody>
                                    {batches.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">No cut batches.</td></tr>}
                                    {batches.map(b => (
                                        <tr key={b.id} className="border-t border-slate-100">
                                            <td className="px-3 py-2.5"><Link to={`/v3/cutting/batches/${b.id}`} className="font-semibold text-indigo-700 hover:underline">{b.batch_code}</Link><span className="block text-xs text-slate-500">{b.customer_name} · {b.numbering_mode === 'MODE_2' ? 'continuous' : 'per roll'}</span></td>
                                            <td className="px-3 py-2.5">{b.style_code}</td>
                                            <td className="px-3 py-2.5"><span className={`text-[11px] font-black px-2 py-0.5 rounded border ${CUT_STATUS[b.status].cls}`}>{CUT_STATUS[b.status].label}</span></td>
                                            <td className="px-3 py-2.5 text-right tabular-nums">{b.rolls_cut} / {b.rolls}</td>
                                            <td className="px-3 py-2.5 text-right tabular-nums">{b.pieces}</td>
                                            <td className="px-3 py-2.5 whitespace-nowrap">{new Date(b.created_at).toLocaleDateString('en-IN')}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

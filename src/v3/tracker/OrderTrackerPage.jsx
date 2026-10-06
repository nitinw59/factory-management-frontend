// Order tracker (3.0's "production planning" + "production workflow" of 2.0):
// every approved order with a red / amber / green / grey dot per phase —
// BOM, materials, issue, cutting, production stages, milestones — worst first.
// One search box finds the order behind any number: order, buyer PO, customer,
// PO, GRN, issue slip, cut batch, garment number or piece label.
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { trackerApi } from '../api/trackerApi';
import { apiError } from '../api/mastersApi';
import { PageHeader, inputCls, SecondaryButton, ErrorBox, Loading } from '../components/ui';
import { fmtDate } from '../salesOrders/SalesOrderStatusBadge';
import { daysText } from '../planning/readinessShared';
import { PHASES, Dot } from './trackerShared';

const TYPE_LABEL = { ORDER: 'Order', PO: 'PO', GRN: 'GRN', ISSUE: 'Issue slip', BATCH: 'Cut batch', GARMENT: 'Garment', PIECE: 'Piece' };

export default function OrderTrackerPage() {
    const navigate = useNavigate();
    const [rows, setRows] = useState(null);
    const [rag, setRag] = useState('');
    const [mine, setMine] = useState(false);
    const [filter, setFilter] = useState('');
    const [q, setQ] = useState('');
    const [hits, setHits] = useState(null);
    const [error, setError] = useState('');
    const load = useCallback(() => {
        trackerApi.orders({ rag: rag || undefined, q: filter || undefined, mine: mine ? 1 : undefined }).then(res => setRows(res.data.orders)).catch(err => setError(apiError(err, 'Failed to load orders.')));
    }, [rag, filter, mine]);
    useEffect(() => { setRows(null); load(); }, [load]);

    const search = async (e) => {
        e.preventDefault(); setError(''); setHits(null);
        if (q.trim().length < 2) return;
        try {
            const list = (await trackerApi.search(q.trim())).data;
            const orders = [...new Set(list.filter(h => h.trackable).map(h => h.order_id))];
            if (orders.length === 1 && list.length === 1) navigate(`/v3/tracker/orders/${orders[0]}`);
            else setHits(list);
        } catch (err) { setError(apiError(err, 'Search failed.')); }
    };
    const counts = rows ? { RED: rows.filter(r => r.rag === 'RED').length, AMBER: rows.filter(r => r.rag === 'AMBER').length, GREEN: rows.filter(r => r.rag === 'GREEN').length } : null;

    return (
        <div>
            <PageHeader title="Order tracker" subtitle="Every approved order from BOM to production, worst first. Read only — each step is done in its own page." />
            <form onSubmit={search} className="flex flex-wrap gap-2 items-center mb-3">
                <div className="relative">
                    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input className={`${inputCls} !w-96 pl-9`} value={q} onChange={e => setQ(e.target.value)} placeholder="Find: order, buyer PO, customer, PO, GRN, batch, garment no., piece label" />
                </div>
                <SecondaryButton type="submit">Find</SecondaryButton>
            </form>
            {hits && (
                <div className="bg-white border border-slate-200 rounded-xl mb-4 overflow-hidden">
                    <p className="px-3 py-2 text-xs font-black uppercase tracking-wider text-slate-500 bg-slate-50 flex">Found {hits.length}<button type="button" className="ml-auto underline normal-case font-semibold" onClick={() => setHits(null)}>close</button></p>
                    {hits.length === 0 ? <p className="px-3 py-3 text-sm text-slate-400">Nothing found.</p> : hits.map((h, i) => (
                        <div key={i} className="px-3 py-2 border-t border-slate-100 text-sm flex flex-wrap gap-2 items-center">
                            <span className="text-[11px] font-bold bg-slate-100 rounded px-1.5">{TYPE_LABEL[h.type]}</span>
                            <span className="font-mono text-xs">{h.code}</span><span className="text-slate-500">{h.label}</span>
                            <span className="ml-auto">{h.trackable ? <Link to={`/v3/tracker/orders/${h.order_id}`} className="font-semibold text-indigo-700 hover:underline">{h.order_no} →</Link> : <span className="text-xs text-slate-400">{h.order_no} ({String(h.status).toLowerCase()} — not tracked)</span>}</span>
                        </div>
                    ))}
                </div>
            )}
            <div className="flex flex-wrap gap-2 items-center mb-3">
                {['', 'RED', 'AMBER', 'GREEN'].map(x => (
                    <button key={x || 'all'} type="button" onClick={() => setRag(x)} className={`px-3 py-1 rounded-lg text-xs font-bold border ${rag === x ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white border-slate-200 text-slate-600'}`}>
                        {x ? `${x.charAt(0)}${x.slice(1).toLowerCase()}${counts && !rag ? ` (${counts[x]})` : ''}` : 'All'}
                    </button>
                ))}
                <label className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-700 bg-white border border-slate-200 rounded-lg px-3 py-1 cursor-pointer"><input type="checkbox" checked={mine} onChange={e => setMine(e.target.checked)} /> Your next steps</label>
                <input className={`${inputCls} !w-60 !py-1`} value={filter} onChange={e => setFilter(e.target.value)} placeholder="Filter: order, customer, style" aria-label="Filter orders" />
            </div>
            <ErrorBox text={error} />
            {!rows ? <Loading /> : (
                <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
                    <table className="w-full text-sm min-w-[980px]">
                        <thead className="bg-slate-50 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                            <tr><th className="px-3 py-2">Order</th><th className="px-3 py-2">Ship</th><th className="px-3 py-2 text-right">Ordered</th><th className="px-3 py-2 text-right">Cut</th><th className="px-3 py-2">Your steps</th>
                                {PHASES.map(p => <th key={p.key} className="px-2 py-2 text-center">{p.label}</th>)}</tr>
                        </thead>
                        <tbody>{rows.length === 0 ? <tr><td colSpan={11} className="px-3 py-6 text-center text-slate-400">{mine ? 'Nothing waiting for you.' : 'No approved orders.'}</td></tr> : rows.map(o => (
                            <tr key={o.order_id} className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer" onClick={() => navigate(`/v3/tracker/orders/${o.order_id}`)}>
                                <td className="px-3 py-2"><span className="inline-flex items-center gap-2"><Dot rag={o.rag} title={`Overall: ${o.rag.toLowerCase()}`} /><b>{o.order_no}</b></span>
                                    <span className="block text-xs text-slate-500">{o.customer_name}{o.buyer_po_no ? ` · PO ${o.buyer_po_no}` : ''} · {o.styles}</span></td>
                                <td className={`px-3 py-2 whitespace-nowrap ${o.days_to_ship != null && o.days_to_ship < 0 ? 'text-rose-700 font-bold' : ''}`}>{fmtDate(o.ship_date)}<span className="block text-xs text-slate-500">{daysText(o.days_to_ship)}</span></td>
                                <td className="px-3 py-2 text-right tabular-nums">{o.ordered}</td>
                                <td className="px-3 py-2 text-right tabular-nums">{o.cut}</td>
                                <td className="px-3 py-2 text-xs">{o.my_steps ? <span className="font-semibold text-indigo-700" title={o.my_step_labels.join('\n')}>{o.my_steps} · {o.my_step_labels[0]}{o.my_steps > 1 ? ' …' : ''}</span> : <span className="text-slate-300">—</span>}</td>
                                {PHASES.map(p => <td key={p.key} className="px-2 py-2 text-center"><Dot rag={o.phases[p.key].rag} title={`${p.label}: ${o.phases[p.key].text}`} /></td>)}
                            </tr>
                        ))}</tbody>
                    </table>
                </div>
            )}
            <p className="mt-2 text-[11px] text-slate-500">Dots: green done / on track, amber in progress or needs attention, red late or short, grey not started. Hover a dot for the detail; click an order for its trail, progress grid and your next steps (each opens the page where the step is done).</p>
        </div>
    );
}

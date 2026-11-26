// Trim orders & kits — /v3/trim-orders (26 Nov 2026, "Trim orders and kits", migration 90; was Trim kits). A trim order
// per cut batch, made when the batch is finalised; the trim store prepares it in kits (bags, TK3/…/####-n — the kit number
// is written on the bag), several ready at once; any line loader counts and signs a kit. Line loaders land on "Ready kits"
// (search by the kit number on the bag); the store on the trim orders to prepare.
// 21 Oct 2026: "Pending to fulfil" — what the store couldn't put in a kit (not in stock / damaged / count short), per item
// with the stock now; "Extra lines" — the store's requests to hand another item from free stock (the merchandiser approves).
import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { trimKitsApi } from '../api/trimKitsApi';
import { apiError } from '../api/mastersApi';
import { useV3Live } from '../live';
import { PageHeader, SearchInput, ErrorBox, Loading } from '../components/ui';
import { ORDER_STATUS, KIT_STATE, SHORT_REASON, qty } from './trimKitShared';
import KitReturns from './KitReturns';
import { fmtDate } from '../salesOrders/SalesOrderStatusBadge';

// What the page lists (26 Nov 2026, owner: "this tab layout is very confusing" → "build"): first WHAT you look at — trim
// orders, kits, what needs attention, trim slips — then WHICH ones, as chips with counts. Each chip is a tab key (the URL
// keeps ?tab=…, so My work links still land); `count` reads GET /trim-orders/counts; `bad` makes a waiting count red.
const VIEWS = [
    { key: 'orders', label: 'Trim orders', chips: [['OPEN', 'To prepare', c => c.orders.open], ['PARTLY_ISSUED', 'Handed in part', c => c.orders.partly], ['ISSUED,CLOSED,CANCELLED', 'Done', c => c.orders.done], ['ALL', 'All', c => c.orders.all]] },
    { key: 'kits', label: 'Kits', chips: [['kits:READY', 'Ready', c => c.kits.ready], ['kits:PREPARING', 'Being prepared', c => c.kits.preparing], ['kits:SIGNED', 'Signed', c => c.kits.signed], ['kits:', 'All', c => c.kits.all]] },
    { key: 'attention', label: 'Needs attention', chips: [['pending', 'Pending to fulfil', c => c.attention.pending, true], ['returns', 'Rejected by line', c => c.attention.returns, true], ['extra', 'Extra lines', c => c.attention.extra, true]] },
    { key: 'slips', label: 'Trim slips', chips: [['slips', 'Trim slips']] },
];
const viewOf = (tab) => VIEWS.find(v => v.chips.some(([k]) => k === tab)) || (tab.startsWith('kits:') ? VIEWS[1] : VIEWS[0]);
// Each role sees what it uses: the trim store everything; a line loader kits and slips; the merchandiser trim orders and
// what needs attention (extra lines to approve); anyone else who may look: trim orders, kits, slips.
const viewsFor = (perm) => (!perm ? [] : perm.prepare ? ['orders', 'kits', 'attention', 'slips']
    : perm.sign ? ['kits', 'slips'] : perm.approve_extra ? ['orders', 'attention', 'slips'] : ['orders', 'kits', 'slips']);
const when = (d) => (d ? new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');

// Whole rows open their page (26 Nov 2026, owner: "in /v3/trim-orders make whole row clickable"); a link or button inside
// the row keeps its own click, and selecting text is not a click.
const rowGo = (navigate, to) => ({
    onClick: (e) => { if (e.target.closest('a, button, input, select, textarea') || window.getSelection()?.toString()) return; navigate(to); },
    className: 'cursor-pointer',
});

// Trim slips (4 Nov 2026): what signed kits sent to the lines, apart from the fabric slips.
function TrimSlips({ rows }) {
    const navigate = useNavigate();
    return (
        <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
                <thead className="bg-slate-50 text-left text-xs font-bold text-slate-500 uppercase tracking-wider"><tr><th className="px-3 py-2.5">Slip</th><th className="px-3 py-2.5">Date</th><th className="px-3 py-2.5">Order</th><th className="px-3 py-2.5">To</th><th className="px-3 py-2.5">Signed by</th><th className="px-3 py-2.5 text-right">Items</th></tr></thead>
                <tbody>
                    {rows.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">No trim slips.</td></tr>}
                    {rows.map(s => (
                        <tr key={s.id} onClick={rowGo(navigate, `/v3/trim-orders/slips/${s.id}`).onClick} className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer">
                            <td className="px-3 py-2.5"><Link to={`/v3/trim-orders/slips/${s.id}`} className="font-semibold text-indigo-700 hover:underline">{s.issue_no}</Link></td>
                            <td className="px-3 py-2.5 whitespace-nowrap">{fmtDate(s.issue_date)}</td>
                            <td className="px-3 py-2.5">{s.order_no}<span className="block text-xs text-slate-500">{s.customer_name}{s.kit_no ? ` · ${s.kit_no}` : ''}</span></td>
                            <td className="px-3 py-2.5">{s.stage}</td><td className="px-3 py-2.5">{s.received_by}</td>
                            <td className="px-3 py-2.5 text-right tabular-nums">{s.line_count}{s.has_returns && <span className="block text-[11px] text-slate-500">with returns</span>}</td>
                        </tr>
                    ))}
                </tbody>
                {rows.length > 0 && <tfoot><tr className="border-t-2 border-slate-200 bg-slate-50 font-bold"><td className="px-3 py-2.5" colSpan={5}>Total · {rows.length} slip{rows.length === 1 ? '' : 's'}</td><td className="px-3 py-2.5 text-right tabular-nums">{rows.reduce((a, s) => a + s.line_count, 0)}</td></tr></tfoot>}
            </table>
        </div>
    );
}

export default function TrimKitsPage() {
    const [params, setParams] = useSearchParams();
    const { pathname } = useLocation();
    const [perm, setPerm] = useState(null);
    // /v3/trim-kits?status=READY (the loaders' queue, My work cards) and ?sent_back=1 → the kit tabs
    const kitsPath = pathname.startsWith('/v3/trim-kits');
    const status = params.get('tab') || (params.get('status') ? `${kitsPath ? 'kits:' : ''}${params.get('status')}` : null);
    const sentBack = params.get('sent_back') === '1' && !params.get('tab');
    const [rows, setRows] = useState(null);
    const [search, setSearch] = useState('');
    const [error, setError] = useState('');
    useEffect(() => { trimKitsApi.permissions().then(res => setPerm(res.data)).catch(() => setPerm({ prepare: false, sign: false })); }, []);
    // Default tab: the store sees what it has to prepare, the line loader the ready kits, the merchandiser the extra lines.
    const tab = status ?? (perm && perm.prepare ? 'OPEN' : perm && perm.approve_extra && !perm.sign ? 'extra' : 'kits:READY');
    const go = (key) => { setRows(null); setParams({ tab: key }); };
    const [extraStatus, setExtraStatus] = useState('PENDING');
    const [returnStatus, setReturnStatus] = useState('ALL');
    const load = useCallback(() => {
        if (!perm) return;
        setError('');
        const q = search.trim() || undefined;
        if (tab === 'pending') { trimKitsApi.pending().then(res => setRows(res.data)).catch(err => setError(apiError(err, 'Failed to load.'))); return; }
        if (tab === 'slips') { trimKitsApi.slips({ q }).then(res => setRows(res.data)).catch(err => setError(apiError(err, 'Failed to load the slips.'))); return; }
        if (tab === 'returns') { trimKitsApi.returns({ status: returnStatus === 'ALL' ? undefined : returnStatus }).then(res => setRows(res.data)).catch(err => setError(apiError(err, 'Failed to load.'))); return; }
        if (tab === 'extra') { trimKitsApi.extraRequests(extraStatus).then(res => setRows(res.data)).catch(err => setError(apiError(err, 'Failed to load.'))); return; }
        if (tab.startsWith('kits:')) { trimKitsApi.kits({ status: tab.slice(5) || undefined, sent_back: sentBack ? 1 : undefined, q }).then(res => setRows(res.data)).catch(err => setError(apiError(err, 'Failed to load the kits.'))); return; }
        trimKitsApi.list({ status: tab === 'ALL' ? undefined : tab, q }).then(res => setRows(res.data)).catch(err => setError(apiError(err, 'Failed to load the trim orders.')));
    }, [perm, tab, search, extraStatus, sentBack, returnStatus]);
    useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [load]);
    useV3Live(load);
    const kitTab = tab.startsWith('kits:');
    const [counts, setCounts] = useState(null);
    const loadCounts = useCallback(() => { trimKitsApi.counts().then(res => setCounts(res.data)).catch(() => {}); }, []);
    useEffect(() => { loadCounts(); }, [loadCounts, tab]);
    useV3Live(loadCounts);
    const view = viewOf(tab);
    const allowed = viewsFor(perm);
    const chipsOf = (v) => v.chips.filter(([k]) => k !== 'pending' || perm?.prepare);
    // a switch opens on its first chip with something in it (the waiting ones for Needs attention), else its first
    const openView = (v) => { const ch = chipsOf(v); const busy = counts && ch.find(([, , f, bad]) => bad && f && f(counts) > 0); go((busy || ch[0])[0]); };

    return (
        <div>
            <PageHeader title="Trim orders & kits" subtitle="A trim order per cut batch (Order BOM × garments cut). The store prepares it in kits — bags with the kit number written on them; a line loader checks and signs each kit, which issues it." />
            {/* 1 — what you look at */}
            <div className="inline-flex flex-wrap rounded-xl border border-slate-300 bg-white p-1 mb-3 gap-1">
                {VIEWS.filter(v => allowed.includes(v.key) || v.key === view.key).map(v => {
                    // the switch's red number: what waits in the chips this person sees
                    const n = counts ? chipsOf(v).filter(([, , f, bad]) => bad && f).reduce((a, [, , f]) => a + f(counts), 0) : 0;
                    return (
                        <button key={v.key} type="button" onClick={() => openView(v)}
                            className={`px-4 py-2 rounded-lg text-sm font-black whitespace-nowrap inline-flex items-center gap-2 ${view.key === v.key ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
                            {v.label}{n > 0 && <span className={`min-w-[20px] px-1.5 py-0.5 rounded-full text-[11px] leading-none ${view.key === v.key ? 'bg-white text-rose-700' : 'bg-rose-600 text-white'}`}>{n}</span>}
                        </button>
                    );
                })}
            </div>
            {/* 2 — which ones */}
            {chipsOf(view).length > 1 && (
                <div className="flex flex-wrap items-center gap-2 mb-3">
                    {chipsOf(view).map(([key, label, f, bad]) => {
                        const n = counts && f ? f(counts) : null; const on = tab === key;
                        return (
                            <button key={key} type="button" onClick={() => go(key)}
                                className={`px-3 py-1.5 rounded-full border text-sm font-bold whitespace-nowrap inline-flex items-center gap-1.5 ${on ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-700 border-slate-300 hover:border-slate-500'}`}>
                                {label}{n != null && <span className={`tabular-nums ${on ? 'text-white/80' : bad && n > 0 ? 'text-rose-700' : 'text-slate-400'}`}>{n}</span>}
                            </button>
                        );
                    })}
                    {view.key === 'kits' && counts?.kits.sent_back > 0 && <span className="text-xs font-bold text-rose-700">{counts.kits.sent_back} sent back by the line</span>}
                    {view.key === 'attention' && counts?.attention.returns_recent > 0 && <span className="text-xs text-slate-500">{counts.attention.returns_recent} rejected in the last 24 h, received automatically</span>}
                </div>
            )}
            {!['pending', 'returns', 'extra'].includes(tab) && (
                <div className="flex flex-wrap items-center gap-3 mb-3">
                    <span className="text-sm text-slate-600">{Array.isArray(rows) ? `${rows.length} ${kitTab ? `kit${rows.length === 1 ? '' : 's'}` : tab === 'slips' ? `slip${rows.length === 1 ? '' : 's'}` : `trim order${rows.length === 1 ? '' : 's'}`}${search.trim() ? ` matching "${search.trim()}"` : ''}` : ''}</span>
                    <div className="ml-auto"><SearchInput value={search} onChange={setSearch} placeholder={kitTab ? 'Kit no. (on the bag), order, batch, line' : tab === 'slips' ? 'Slip, order, kit' : 'Trim order, order, batch, customer'} /></div>
                </div>
            )}
            {sentBack && kitTab && <p className="mb-2 text-sm text-rose-800">Kits sent back by the line — <button type="button" className="font-bold underline" onClick={() => go(tab)}>show every kit being prepared</button></p>}
            <ErrorBox text={error} />
            {tab === 'slips' ? (!Array.isArray(rows) ? <Loading /> : <TrimSlips rows={rows} />)
            : tab === 'pending' ? (!rows || Array.isArray(rows) ? <Loading /> : <PendingView data={rows} />)
            : tab === 'returns' ? (!rows || Array.isArray(rows) ? <Loading /> : <ReturnsView data={rows} perm={perm} status={returnStatus} setStatus={(v) => { setRows(null); setReturnStatus(v); }} reload={() => { load(); loadCounts(); }} />)
            : tab === 'extra' ? (!Array.isArray(rows) ? <Loading /> : <ExtraView rows={rows} status={extraStatus} setStatus={(v) => { setRows(null); setExtraStatus(v); }} />)
            : kitTab ? (!Array.isArray(rows) ? <Loading /> : <KitList rows={rows} ready={tab === 'kits:READY'} signed={tab === 'kits:SIGNED'} />)
            : !Array.isArray(rows) ? <Loading /> : rows.length === 0 ? (
                <p className="text-sm text-slate-500 bg-white border border-slate-200 rounded-xl p-6 text-center">No trim orders here.</p>
            ) : <OrderList rows={rows} /> }
        </div>
    );
}

// Trim orders — one row per trim order, a column each (26 Nov 2026: was a free-flowing line per order, nothing lined up).
function OrderList({ rows }) {
    const navigate = useNavigate();
    const sum = (k) => rows.reduce((a, r) => a + (Number(r[k]) || 0), 0);
    const KITS = [['kits_ready', 'ready', 'text-emerald-700'], ['kits_preparing', 'being prepared', 'text-slate-600'], ['kits_signed', 'signed', 'text-indigo-700'], ['kits_sent_back', 'sent back', 'text-rose-700']];
    const TH = 'px-3 py-2.5';
    return (
        <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
            <table className="w-full text-sm min-w-[1000px]">
                <thead className="bg-slate-50 text-left text-xs font-bold text-slate-500 uppercase tracking-wider"><tr>
                    <th className={`${TH} pl-4`}>Trim order</th><th className={TH}>Status</th><th className={TH}>Batch</th><th className={TH}>Order · customer</th>
                    <th className={`${TH} text-right`}>Items</th><th className={TH}>Kits</th><th className={TH}>Made</th>
                </tr></thead>
                <tbody>
                    {rows.map(k => (
                        <tr key={k.id} onClick={rowGo(navigate, `/v3/trim-orders/${k.id}`).onClick} className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer align-top">
                            <td className={`${TH} pl-4 whitespace-nowrap`}><Link to={`/v3/trim-orders/${k.id}`} className="font-black text-slate-900 hover:text-indigo-700">{k.trim_order_no}</Link>
                                {k.kind === 'SAMPLE' && <span className="block mt-0.5 w-fit text-[10px] font-black px-1.5 py-0.5 rounded border bg-violet-50 text-violet-800 border-violet-300">Sample · {k.sample_type} · {k.sample_request_no}</span>}
                                {k.bom_changed && <span className="block mt-0.5 w-fit text-[10px] font-black px-1.5 py-0.5 rounded border bg-amber-50 text-amber-800 border-amber-300" title="The order's BOM changed after this trim order was started">BOM changed</span>}</td>
                            <td className={TH}><span className={`text-[11px] font-black px-2 py-0.5 rounded border whitespace-nowrap ${(ORDER_STATUS[k.status] || ORDER_STATUS.OPEN).cls}`}>{(ORDER_STATUS[k.status] || ORDER_STATUS.OPEN).label}</span></td>
                            <td className={`${TH} whitespace-nowrap`}>{k.floor_no ? <b>#{k.floor_no}</b> : <span className="text-slate-400">—</span>}{k.batch_code && <span className="block text-xs text-slate-500">{k.batch_code}</span>}</td>
                            <td className={TH}><span className="whitespace-nowrap">{k.order_no}</span><span className="block text-xs text-slate-500">{k.customer_name}</span></td>
                            <td className={`${TH} text-right tabular-nums`}>{k.line_count}{k.status === 'PARTLY_ISSUED' && k.open_lines ? <span className="block text-[11px] text-amber-700">{k.open_lines} still to hand</span> : null}</td>
                            <td className={`${TH} text-xs`}>{KITS.some(([f]) => k[f]) ? KITS.filter(([f]) => k[f]).map(([f, t, c]) => <b key={f} className={`block whitespace-nowrap ${c}`}>{k[f]} {t}</b>) : <span className="text-slate-400">no kit yet</span>}</td>
                            <td className={`${TH} text-xs text-slate-500 whitespace-nowrap`}>{new Date(k.created_at).toLocaleDateString('en-IN')}</td>
                        </tr>
                    ))}
                </tbody>
                <tfoot><tr className="border-t-2 border-slate-200 bg-slate-50 text-xs font-bold">
                    <td className={`${TH} pl-4`} colSpan={4}>Total · {rows.length} trim order{rows.length === 1 ? '' : 's'}</td>
                    <td className={`${TH} text-right tabular-nums`}>{sum('line_count')}</td>
                    <td className={TH} colSpan={2}>{KITS.filter(([f]) => sum(f)).map(([f, t, c]) => <span key={f} className={`mr-3 ${c}`}>{sum(f)} {t}</span>)}</td>
                </tr></tfoot>
            </table>
        </div>
    );
}

// Kits — the bags (26 Nov 2026). The line loader looks for the kit number written on the bag.
function KitList({ rows, ready, signed }) {
    const navigate = useNavigate();
    if (!rows.length) return <p className="text-sm text-slate-500 bg-white border border-slate-200 rounded-xl p-6 text-center">{ready ? 'No kit is waiting for pickup.' : 'No kits here.'}</p>;
    return (
        <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
            <table className="w-full text-sm min-w-[860px]">
                <thead className="bg-slate-50 text-left text-xs font-bold text-slate-500 uppercase tracking-wider"><tr><th className="px-4 py-2.5">Kit no.</th><th className="px-3 py-2.5">Status</th><th className="px-3 py-2.5">Batch · order</th><th className="px-3 py-2.5">Stages</th><th className="px-3 py-2.5">Goes to</th><th className="px-3 py-2.5 text-right">Items</th><th className="px-3 py-2.5">{ready ? 'Ready' : signed ? 'Signed' : 'Made'}</th></tr></thead>
                <tbody>
                    {rows.map(t => (
                        <tr key={t.id} onClick={rowGo(navigate, `/v3/trim-kits/${t.id}`).onClick} className="border-t border-slate-100 hover:bg-slate-50 align-top cursor-pointer">
                            <td className="px-4 py-2.5"><Link to={`/v3/trim-kits/${t.id}`} className="text-lg font-black tracking-tight text-indigo-700 hover:underline whitespace-nowrap">{t.kit_no}</Link>
                                {t.sent_back_at && t.status === 'PREPARING' && <span className="block text-xs font-semibold text-rose-700">sent back: {t.sent_back_reason}</span>}</td>
                            <td className="px-3 py-2.5"><span className={`text-[11px] font-black px-2 py-0.5 rounded border whitespace-nowrap ${(KIT_STATE[t.status] || KIT_STATE.PREPARING).cls}`}>{(KIT_STATE[t.status] || KIT_STATE.PREPARING).label}</span></td>
                            <td className="px-3 py-2.5"><span className="whitespace-nowrap">{t.floor_no ? <b className="mr-1">#{t.floor_no}</b> : null}{t.order_no}</span><span className="block text-xs text-slate-500">{t.customer_name}</span><span className="block text-xs text-slate-400 whitespace-nowrap">{t.trim_order_no}</span></td>
                            <td className="px-3 py-2.5 text-xs max-w-[220px]">{t.stages || '—'}</td>
                            <td className="px-3 py-2.5 font-semibold">{t.goes_to || <span className="font-normal text-slate-400">any line</span>}</td>
                            <td className="px-3 py-2.5 text-right tabular-nums">{t.line_count}{t.labels_qty ? <span className="block text-[11px] text-slate-500">+ {t.labels_qty} labels</span> : null}</td>
                            <td className="px-3 py-2.5 text-xs text-slate-500"><span className="whitespace-nowrap">{when(ready ? t.ready_at : signed ? t.signed_at : t.created_at)}</span>{ready && t.ready_by_name ? <span className="block">{t.ready_by_name}</span> : null}</td>
                        </tr>
                    ))}
                </tbody>
                <tfoot><tr className="border-t-2 border-slate-200 bg-slate-50 text-xs font-bold"><td className="px-4 py-2.5" colSpan={5}>Total · {rows.length} kit{rows.length === 1 ? '' : 's'}{rows.some(t => t.labels_qty) ? ` · ${rows.reduce((a, t) => a + (t.labels_qty || 0), 0)} garment labels` : ''}</td><td className="px-3 py-2.5 text-right tabular-nums">{rows.reduce((a, t) => a + t.line_count, 0)}</td><td /></tr></tfoot>
            </table>
        </div>
    );
}

// Pending to fulfil: per item — on hand / free now, and every kit line still owed after a short pick.
function PendingView({ data }) {
    const navigate = useNavigate();
    if (!data.items.length) return <p className="text-sm text-slate-500 bg-white border border-slate-200 rounded-xl p-6 text-center">Nothing pending — every kit got what it owed.</p>;
    const total = data.items.reduce((a, i) => a + i.lines.length, 0);
    return (
        <div className="space-y-3">
            <p className="text-sm text-slate-600">{data.lines} trim order line(s) wait for stock{data.can_fill ? <> — <b className="text-emerald-700">{data.can_fill} can be filled now</b> (open the trim order and make a kit)</> : ''}. An order line fills from the order's allocation; an over-cut or extra line from free stock.</p>
            {data.items.map(i => (
                <div key={i.item_id} className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 bg-slate-50 border-b border-slate-200 text-sm">
                        <b className="text-slate-900">{i.label}</b>
                        <span className="text-slate-600">on hand <b>{qty(i.on_hand, i.uom)}</b> · free <b>{qty(i.free, i.uom)}</b> {i.uom}</span>
                        <span className="ml-auto text-amber-800 font-semibold">owed {qty(i.owed, i.uom)} {i.uom}</span>
                    </div>
                    <table className="w-full text-sm min-w-[760px]">
                        <thead className="text-xs font-bold text-slate-500 uppercase"><tr><th className="px-3 py-1.5 text-left">Trim order</th><th className="px-3 py-1.5 text-left">Order · batch</th><th className="px-3 py-1.5 text-right">Owed</th><th className="px-3 py-1.5 text-left">Why short</th><th className="px-3 py-1.5 text-left">Since</th><th className="px-3 py-1.5 text-left">Now</th></tr></thead>
                        <tbody>
                            {i.lines.map(l => (
                                <tr key={l.order_line_id} onClick={rowGo(navigate, `/v3/trim-orders/${l.trim_order_id}`).onClick} className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer">
                                    <td className="px-3 py-1.5"><Link to={`/v3/trim-orders/${l.trim_order_id}`} className="font-bold text-indigo-700 hover:underline">{l.trim_order_no}</Link> <span className="text-[11px] text-slate-500">{ORDER_STATUS[l.kit_status]?.label}</span></td>
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
    const navigate = useNavigate();
    return (
        <div>
            <div className="flex items-center gap-1 mb-2 text-sm"><span className="text-xs text-slate-400 mr-1">Show:</span>{[['PENDING', 'Waiting'], ['APPROVED', 'Approved'], ['REFUSED', 'Refused'], ['ALL', 'All']].map(([k, lab]) => (
                <button key={k} type="button" onClick={() => setStatus(k)} className={`px-1.5 py-0.5 text-xs font-bold ${status === k ? 'text-slate-900 underline underline-offset-4 decoration-2' : 'text-slate-500 hover:text-slate-800'}`}>{lab}</button>))}</div>
            {rows.length === 0 ? <p className="text-sm text-slate-500 bg-white border border-slate-200 rounded-xl p-6 text-center">No extra line requests here.</p> : (
                <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
                    <table className="w-full text-sm min-w-[860px]">
                        <thead className="text-xs font-bold text-slate-500 uppercase bg-slate-50"><tr><th className="px-3 py-2 text-left">Trim order</th><th className="px-3 py-2 text-left">Instead of</th><th className="px-3 py-2 text-left">Extra line (free stock)</th><th className="px-3 py-2 text-left">Why</th><th className="px-3 py-2 text-left">Status</th></tr></thead>
                        <tbody>
                            {rows.map(r => (
                                <tr key={r.id} onClick={rowGo(navigate, `/v3/trim-orders/${r.trim_order_id}`).onClick} className="border-t border-slate-100 align-top hover:bg-slate-50 cursor-pointer">
                                    <td className="px-3 py-2"><Link to={`/v3/trim-orders/${r.trim_order_id}`} className="font-bold text-indigo-700 hover:underline">{r.trim_order_no}</Link><span className="block text-xs text-slate-500">{r.order_no}{r.floor_no ? ` · #${r.floor_no}` : ''} · {r.customer_name}</span></td>
                                    <td className="px-3 py-2">{r.replaces_label}<span className="block text-xs text-amber-800">{qty(r.replaces_owed, r.replaces_uom)} {r.replaces_uom} owed</span></td>
                                    <td className="px-3 py-2 font-semibold">{r.label}<span className="block text-xs font-normal">{qty(r.qty, r.uom)} {r.uom}</span></td>
                                    <td className="px-3 py-2 text-xs">{r.reason}<span className="block text-slate-500">{r.requested_by_name} · {new Date(r.created_at).toLocaleString('en-IN')}</span></td>
                                    <td className="px-3 py-2 text-xs"><b>{r.status.toLowerCase()}</b>{r.decided_by_name ? <span className="block text-slate-500">{r.decided_by_name}{r.decision_note ? ` — ${r.decision_note}` : ''}</span> : null}</td>
                                </tr>
                            ))}
                            <tr className="border-t-2 border-slate-200 bg-slate-50 text-xs font-bold"><td className="px-3 py-2" colSpan={5}>{rows.length} request(s){status === 'PENDING' ? ' — open the trim order to approve or refuse' : ''}</td></tr>
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

// Rejected by line (26 Nov 2026, migration 92): what the line loaders did not take from a kit — back to the store.
function ReturnsView({ data, perm, status, setStatus, reload }) {
    const { rows, auto_confirm: auto } = data;
    return (
        <div>
            <div className="flex flex-wrap items-center gap-1 mb-2 text-sm">
                <span className="text-xs text-slate-400 mr-1">Show:</span>
                {[['ALL', 'All'], ['PENDING', 'To confirm'], ['RECEIVED', 'Back on the shelf'], ['WRITTEN_OFF', 'Written off']].map(([k, lab]) => (
                    <button key={k} type="button" onClick={() => setStatus(k)} className={`px-1.5 py-0.5 text-xs font-bold ${status === k ? 'text-slate-900 underline underline-offset-4 decoration-2' : 'text-slate-500 hover:text-slate-800'}`}>{lab}</button>))}
                <span className="text-xs text-slate-500">{auto ? 'Received back automatically when the kit is signed (Settings) — check what comes back and write off what is damaged.' : 'The store confirms each: received back (on the shelf) or written off.'}</span>
            </div>
            {rows.length === 0 ? <p className="text-sm text-slate-500 bg-white border border-slate-200 rounded-xl p-6 text-center">Nothing rejected by the lines here.</p>
                : <div className="bg-white border border-slate-200 rounded-xl"><KitReturns rows={rows} canConfirm={Boolean(perm?.prepare)} showOrder onDone={reload} /></div>}
        </div>
    );
}

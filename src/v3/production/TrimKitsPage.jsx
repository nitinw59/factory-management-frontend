// Trim kits (2.0's trim orders): the store prepares kits by hand for an order and marks them ready; the line
// loader picks them up — counts and signs, which issues them (an issue slip). Line loaders land on "Ready for
// pickup"; the store on everything open.
import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus, ChevronRight } from 'lucide-react';
import { trimKitsApi } from '../api/trimKitsApi';
import { apiError } from '../api/mastersApi';
import { useV3Live } from '../live';
import { PageHeader, SearchInput, ErrorBox, Loading } from '../components/ui';
import { KIT_STATUS, ACTION } from './trimKitShared';

const TABS = [
    ['READY', 'Ready for pickup'],
    ['DRAFT,PARTLY_ISSUED', 'Being prepared'],
    ['ISSUED,CLOSED,CANCELLED', 'Done'],
    ['', 'All'],
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
    const tab = status ?? (perm && perm.prepare ? 'DRAFT,PARTLY_ISSUED' : 'READY');
    const load = useCallback(() => {
        if (!perm) return;
        trimKitsApi.list({ status: tab || undefined, q: search.trim() || undefined }).then(res => setRows(res.data)).catch(err => setError(apiError(err, 'Failed to load trim kits.')));
    }, [perm, tab, search]);
    useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [load]);
    useV3Live(load);

    return (
        <div>
            <PageHeader title="Trim kits" subtitle="The store prepares kits by hand from what is allocated to the order and marks them ready; the line loader counts and signs — that issues them (an issue slip). Threads go by the cone and come back in metres."
                actions={<>
                    <SearchInput value={search} onChange={setSearch} placeholder="Kit, order, batch, customer" />
                    {perm?.prepare && <Link to="/v3/trim-kits/new" className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg"><Plus size={15} /> New kit</Link>}
                </>} />
            <div className="flex flex-wrap gap-1 mb-3 border-b border-slate-200">
                {TABS.map(([k, label]) => (
                    <button key={label} type="button" onClick={() => setParams({ status: k })}
                        className={`px-3 py-2 text-sm font-bold border-b-2 -mb-px ${tab === k ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>{label}</button>
                ))}
            </div>
            <ErrorBox text={error} />
            {!rows ? <Loading /> : rows.length === 0 ? (
                <p className="text-sm text-slate-500 bg-white border border-slate-200 rounded-xl p-6 text-center">{tab === 'READY' ? 'No kit is waiting for pickup.' : 'No kits here.'}</p>
            ) : (
                <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
                    {rows.map(k => (
                        <Link key={k.id} to={`/v3/trim-kits/${k.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 hover:bg-slate-50">
                            <b className="text-slate-900">{k.kit_no}</b>
                            <span className={`text-[11px] font-black px-2 py-0.5 rounded border ${KIT_STATUS[k.status].cls}`}>{KIT_STATUS[k.status].label}</span>
                            <span className="text-sm text-slate-700">{k.order_no}{k.batch_code ? ` · batch ${k.batch_code}` : ''}</span>
                            <span className="text-xs text-slate-500">{k.customer_name} · {k.line_count} item(s){k.status === 'PARTLY_ISSUED' ? ` · ${k.open_lines} still to hand` : ''}</span>
                            {k.last_action === 'SENT_BACK' && <span className="basis-full text-xs font-semibold text-rose-700">{ACTION.SENT_BACK}: {k.last_reason}</span>}
                            <span className="ml-auto text-xs text-slate-500">{k.status === 'READY' && k.ready_at ? `ready ${new Date(k.ready_at).toLocaleString()}${k.ready_by_name ? ` · ${k.ready_by_name}` : ''}` : new Date(k.created_at).toLocaleDateString()}</span>
                            <ChevronRight size={16} className="text-slate-300" />
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
}

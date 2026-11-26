// Samples — /v3/samples (26 Nov 2026, migration 91; backend controllers/v3/samplesController.js). Fabric and trims for PP,
// size set and other samples: the merchandiser raises a sample request on an order line (garments per colour × size);
// on submit the Order BOM gives the trims (a trim order of kind SAMPLE — the trim store prepares a kit and hands it to
// sampling) and the fabric (the fabric store cuts metres off a free roll). The store records each handover (no receiver
// login yet). Everything comes from free stock and shows apart in the order's cost.
import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus, Settings2 } from 'lucide-react';
import Modal from '../../shared/Modal';
import { samplesApi } from '../api/samplesApi';
import { apiError } from '../api/mastersApi';
import { useV3Live } from '../live';
import { PageHeader, SearchInput, ErrorBox, Loading, PrimaryButton, SecondaryButton, inputCls } from '../components/ui';

export const SAMPLE_STATUS = {
    DRAFT: { label: 'Draft', cls: 'bg-slate-100 text-slate-700 border-slate-300' },
    SUBMITTED: { label: 'Open', cls: 'bg-sky-50 text-sky-800 border-sky-300' },
    CLOSED: { label: 'Closed', cls: 'bg-indigo-50 text-indigo-700 border-indigo-300' },
    CANCELLED: { label: 'Cancelled', cls: 'bg-slate-50 text-slate-400 border-slate-200 line-through' },
};
const TRIM_TEXT = { OPEN: 'to hand over', PARTLY_ISSUED: 'handed in part', ISSUED: 'handed over', CLOSED: 'closed', CANCELLED: 'cancelled' };
const TABS = [['SUBMITTED', 'Open'], ['trims', 'Trims to hand over'], ['fabric', 'Fabric to issue'], ['DRAFT', 'Drafts'], ['CLOSED,CANCELLED', 'Done'], ['ALL', 'All']];
const day = (d) => (d ? new Date(`${String(d).slice(0, 10)}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—');

export default function SamplesPage() {
    const [params, setParams] = useSearchParams();
    const [perm, setPerm] = useState(null);
    const [rows, setRows] = useState(null);
    const [search, setSearch] = useState('');
    const [error, setError] = useState('');
    const [typesOpen, setTypesOpen] = useState(false);
    useEffect(() => { samplesApi.permissions().then(r => setPerm(r.data)).catch(() => setPerm({})); }, []);
    const tab = params.get('tab') || params.get('status') || (perm ? (perm.trims && !perm.request ? 'trims' : perm.fabric && !perm.request ? 'fabric' : 'SUBMITTED') : null);
    const load = useCallback(() => {
        if (!tab) return;
        setError('');
        const status = ['trims', 'fabric'].includes(tab) ? 'SUBMITTED' : tab === 'ALL' ? undefined : tab;
        samplesApi.list({ status, q: search.trim() || undefined }).then(r => setRows(r.data)).catch(err => setError(apiError(err, 'Failed to load the samples.')));
    }, [tab, search]);
    useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [load]);
    useV3Live(load);
    const shown = !rows ? null : tab === 'trims' ? rows.filter(x => ['OPEN', 'PARTLY_ISSUED'].includes(x.trim_status)) : tab === 'fabric' ? rows.filter(x => x.fabric_open > 0) : rows;

    return (
        <div>
            <PageHeader title="Samples" subtitle="Fabric and trims for proto, fit, PP, size set and other samples. The merchandiser raises a request on an order line; the Order BOM gives what it needs. The trim store hands a kit to sampling and the fabric store cuts metres off a free roll — each records who took it. All from free stock; the order's cost shows samples apart."
                actions={<>
                    <SearchInput value={search} onChange={setSearch} placeholder="Request, order, style, customer, type" />
                    {perm?.types && <SecondaryButton onClick={() => setTypesOpen(true)}><Settings2 size={14} /> Sample types</SecondaryButton>}
                    {perm?.request && <Link to="/v3/samples/new"><PrimaryButton><Plus size={14} /> New sample request</PrimaryButton></Link>}
                </>} />
            <div className="flex flex-wrap gap-1 mb-3 border-b border-slate-200">
                {TABS.map(([k, label]) => (
                    <button key={k} type="button" onClick={() => { setRows(null); setParams({ tab: k }); }}
                        className={`px-3 py-2 text-sm font-bold border-b-2 -mb-px ${tab === k ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>{label}</button>
                ))}
            </div>
            <ErrorBox text={error} />
            {!shown ? <Loading /> : shown.length === 0 ? <p className="text-sm text-slate-500 bg-white border border-slate-200 rounded-xl p-6 text-center">No sample requests here.</p> : (
                <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
                    <table className="w-full text-sm min-w-[1000px]">
                        <thead className="bg-slate-50 text-left text-xs font-bold text-slate-500 uppercase tracking-wider"><tr>
                            <th className="px-4 py-2.5">Request</th><th className="px-3 py-2.5">Type</th><th className="px-3 py-2.5">Order · line · style</th><th className="px-3 py-2.5 text-right">Garments</th>
                            <th className="px-3 py-2.5">Needed by</th><th className="px-3 py-2.5">Trims</th><th className="px-3 py-2.5">Fabric</th><th className="px-3 py-2.5">Status</th></tr></thead>
                        <tbody>{shown.map(x => {
                            const st = SAMPLE_STATUS[x.status] || SAMPLE_STATUS.DRAFT;
                            const late = x.status === 'SUBMITTED' && x.needed_by && x.needed_by < new Date().toISOString().slice(0, 10);
                            return (
                                <tr key={x.id} className="border-t border-slate-100 hover:bg-slate-50 align-top">
                                    <td className="px-4 py-2.5"><Link to={`/v3/samples/${x.id}`} className="font-bold text-indigo-700 hover:underline whitespace-nowrap">{x.request_no}</Link></td>
                                    <td className="px-3 py-2.5">{x.type_name}{x.round_no > 1 ? <span className="text-slate-500"> · round {x.round_no}</span> : ''}{!x.issues_material && <span className="block text-[11px] text-slate-500">from bulk — nothing issued</span>}</td>
                                    <td className="px-3 py-2.5">{x.order_no} · line {x.line_no}{x.style_code ? ` · ${x.style_code}` : ''}<span className="block text-xs text-slate-500">{x.customer_name}</span></td>
                                    <td className="px-3 py-2.5 text-right tabular-nums">{x.garments || 0}</td>
                                    <td className={`px-3 py-2.5 whitespace-nowrap ${late ? 'font-bold text-rose-700' : ''}`}>{day(x.needed_by)}{late ? ' · late' : ''}</td>
                                    <td className="px-3 py-2.5 text-xs">{x.trim_order_id ? <><Link to={`/v3/trim-orders/${x.trim_order_id}`} className="font-semibold text-indigo-700 hover:underline">{x.trim_order_no}</Link><span className="block text-slate-500">{TRIM_TEXT[x.trim_status] || ''}{x.open_kits ? ` · ${x.open_kits} kit(s) open` : ''}</span></> : '—'}</td>
                                    <td className="px-3 py-2.5 text-xs">{x.fabric_lines ? (x.fabric_open ? <b className="text-amber-800">{x.fabric_open} of {x.fabric_lines} to issue</b> : <span className="text-emerald-700">issued</span>) : '—'}</td>
                                    <td className="px-3 py-2.5"><span className={`text-[11px] font-black px-2 py-0.5 rounded border ${st.cls}`}>{st.label}</span></td>
                                </tr>
                            );
                        })}</tbody>
                        <tfoot><tr className="border-t-2 border-slate-200 bg-slate-50 text-xs font-bold"><td className="px-4 py-2.5" colSpan={3}>Total · {shown.length} request(s)</td>
                            <td className="px-3 py-2.5 text-right tabular-nums">{shown.reduce((a, x) => a + (x.garments || 0), 0)}</td><td />
                            <td className="px-3 py-2.5">{shown.filter(x => ['OPEN', 'PARTLY_ISSUED'].includes(x.trim_status)).length} to hand over</td>
                            <td className="px-3 py-2.5">{shown.filter(x => x.fabric_open > 0).length} to issue</td><td /></tr></tfoot>
                    </table>
                </div>
            )}
            {typesOpen && <TypesModal onClose={() => setTypesOpen(false)} />}
        </div>
    );
}

// Sample types (factory admin): the seeded list, rename / re-order, switch off, "pulled from bulk" (no material).
function TypesModal({ onClose }) {
    const [rows, setRows] = useState(null);
    const [error, setError] = useState('');
    const [add, setAdd] = useState({ name: '', issues_material: true });
    useEffect(() => { samplesApi.types(true).then(r => setRows(r.data)).catch(err => setError(apiError(err, 'Failed.'))); }, []);
    const save = async (fn) => { setError(''); try { setRows((await fn()).data); } catch (err) { setError(apiError(err, 'Failed.')); } };
    return (
        <Modal title="Sample types" onClose={onClose}>
            <div className="space-y-3 w-[min(680px,92vw)] max-h-[75vh] overflow-y-auto">
                <p className="text-xs text-slate-500">Types pulled from bulk garments (TOP, shipment) issue no fabric or trims — the request is recorded and closed.</p>
                {!rows ? <Loading /> : (
                    <table className="w-full text-sm">
                        <thead className="text-xs font-bold text-slate-500 uppercase text-left"><tr><th className="py-1">Order</th><th className="py-1">Name</th><th className="py-1">Issues material</th><th className="py-1">Active</th></tr></thead>
                        <tbody>{rows.map(t => (
                            <tr key={t.id} className="border-t border-slate-100">
                                <td className="py-1 pr-2"><input className="w-16 px-2 py-1 border border-slate-300 rounded text-right" type="number" defaultValue={t.sort_order} onBlur={e => Number(e.target.value) !== t.sort_order && save(() => samplesApi.updateType(t.id, { ...t, sort_order: Number(e.target.value) }))} /></td>
                                <td className="py-1 pr-2"><input className={inputCls} defaultValue={t.name} onBlur={e => e.target.value.trim() && e.target.value.trim() !== t.name && save(() => samplesApi.updateType(t.id, { ...t, name: e.target.value.trim() }))} /></td>
                                <td className="py-1"><input type="checkbox" checked={t.issues_material} onChange={() => save(() => samplesApi.updateType(t.id, { ...t, issues_material: !t.issues_material }))} /></td>
                                <td className="py-1"><input type="checkbox" checked={t.is_active} onChange={() => save(() => samplesApi.updateType(t.id, { ...t, is_active: !t.is_active }))} /></td>
                            </tr>
                        ))}
                            <tr className="border-t-2 border-slate-200 text-xs font-bold"><td className="py-1.5" colSpan={4}>{rows.length} type(s) · {rows.filter(t => t.is_active).length} active · {rows.filter(t => !t.issues_material).length} from bulk</td></tr></tbody>
                    </table>
                )}
                <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 pt-3">
                    <input className={`${inputCls} flex-1`} placeholder="New type, e.g. Wash test 2" value={add.name} onChange={e => setAdd({ ...add, name: e.target.value })} />
                    <label className="text-sm inline-flex items-center gap-1"><input type="checkbox" checked={add.issues_material} onChange={e => setAdd({ ...add, issues_material: e.target.checked })} /> issues material</label>
                    <PrimaryButton disabled={!add.name.trim()} onClick={() => save(() => samplesApi.createType({ name: add.name.trim(), issues_material: add.issues_material, sort_order: (rows?.length || 0) * 10 + 10 })).then(() => setAdd({ name: '', issues_material: true }))}>Add</PrimaryButton>
                </div>
                <ErrorBox text={error} />
                <div className="flex justify-end"><SecondaryButton onClick={onClose}>Close</SecondaryButton></div>
            </div>
        </Modal>
    );
}

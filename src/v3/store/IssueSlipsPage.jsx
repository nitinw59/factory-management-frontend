// Store issue slips: list by date range / type / search, value net of
// returns, Excel register (one row per item issued).
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, FileSpreadsheet } from 'lucide-react';
import { storeApi } from '../api/storeApi';
import { apiError } from '../api/mastersApi';
import { PageHeader, SearchInput, PrimaryButton, SecondaryButton, ErrorBox, Loading } from '../components/ui';
import { fmtDate } from '../salesOrders/SalesOrderStatusBadge';
import { TARGET_LABEL, inr, useStorePermissions, exportIssueRegister } from './storeShared';

export default function IssueSlipsPage() {
    const perms = useStorePermissions();
    const navigate = useNavigate();
    const [rows, setRows] = useState(null);
    const [search, setSearch] = useState('');
    const [type, setType] = useState('');
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');
    const [error, setError] = useState('');
    useEffect(() => {
        const t = setTimeout(() => storeApi.issues({ q: search.trim() || undefined, target_type: type || undefined, from: from || undefined, to: to || undefined })
            .then(res => setRows(res.data)).catch(err => setError(apiError(err, 'Failed to load issue slips.'))), 250);
        return () => clearTimeout(t);
    }, [search, type, from, to]);
    const excel = async () => {
        try { exportIssueRegister((await storeApi.issueRegister({ from: from || undefined, to: to || undefined })).data, from, to); } catch (err) { setError(apiError(err, 'Export failed.')); }
    };
    const total = (rows || []).reduce((s, r) => s + r.net_value, 0);

    return (
        <div>
            <PageHeader title="Store issue slips" subtitle={`Spares and general items issued to people, machines and departments. Net value shown: ₹${inr(total)}.`}
                actions={<>
                    <SecondaryButton onClick={excel}><FileSpreadsheet size={14} /> Excel register</SecondaryButton>
                    {perms.stock && <PrimaryButton onClick={() => navigate('/v3/store/issues/new')}><Plus size={14} /> New issue slip</PrimaryButton>}
                </>} />
            <div className="flex flex-wrap items-center gap-2 mb-3">
                <SearchInput value={search} onChange={setSearch} placeholder="Slip, person, machine, item" />
                <select className="px-3 py-2 text-sm border border-slate-300 rounded-lg" value={type} onChange={e => setType(e.target.value)} aria-label="Issued to">
                    <option value="">Everyone</option>{Object.entries(TARGET_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <label className="text-sm text-slate-600 flex items-center gap-1">From <input type="date" className="px-2 py-1.5 text-sm border border-slate-300 rounded-lg" value={from} onChange={e => setFrom(e.target.value)} /></label>
                <label className="text-sm text-slate-600 flex items-center gap-1">To <input type="date" className="px-2 py-1.5 text-sm border border-slate-300 rounded-lg" value={to} onChange={e => setTo(e.target.value)} /></label>
            </div>
            <ErrorBox text={error} />
            {!rows ? <Loading /> : (
                <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
                    <table className="w-full text-sm min-w-[860px]">
                        <thead className="bg-slate-50 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                            <tr><th className="px-3 py-2.5">Slip</th><th className="px-3 py-2.5">Date</th><th className="px-3 py-2.5">Issued to</th><th className="px-3 py-2.5">Department</th><th className="px-3 py-2.5">Purpose</th><th className="px-3 py-2.5 text-right">Items</th><th className="px-3 py-2.5 text-right">Value ₹</th></tr>
                        </thead>
                        <tbody>
                            {rows.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">No issue slips.</td></tr>}
                            {rows.map(r => (
                                <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50">
                                    <td className="px-3 py-2.5"><Link to={`/v3/store/issues/${r.id}`} className="font-semibold text-indigo-700 hover:underline whitespace-nowrap">{r.issue_no}</Link></td>
                                    <td className="px-3 py-2.5 whitespace-nowrap">{fmtDate(r.issue_date)}</td>
                                    <td className="px-3 py-2.5"><span className="text-xs text-slate-500">{TARGET_LABEL[r.target_type]}</span> {r.target_name}{r.recover_from_salary && <span className="ml-1 text-[10px] font-black px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-300">salary</span>}</td>
                                    <td className="px-3 py-2.5 text-slate-600">{r.department_name || '—'}</td>
                                    <td className="px-3 py-2.5 text-slate-600 text-xs">{r.purpose || ''}</td>
                                    <td className="px-3 py-2.5 text-right tabular-nums">{r.line_count}</td>
                                    <td className="px-3 py-2.5 text-right tabular-nums">{inr(r.net_value)}{r.returned_value > 0 && <span className="block text-[11px] text-slate-500">after ₹{inr(r.returned_value)} returned</span>}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

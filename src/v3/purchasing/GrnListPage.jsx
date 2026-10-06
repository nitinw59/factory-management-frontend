// Goods receipts (GRN): list with status filter; "?status=PENDING_APPROVAL"
// is the purchase manager's approval queue. Factory admins set the
// over-receipt tolerance here.
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { purchasingApi } from '../api/purchasingApi';
import { apiError } from '../api/mastersApi';
import { PageHeader, SearchInput, ErrorBox, Loading, inputCls, SecondaryButton } from '../components/ui';
import { fmtDate } from '../salesOrders/SalesOrderStatusBadge';
import { GRN_STATUS } from './grnShared';
import { useAuth } from '../../context/AuthContext';

export default function GrnListPage() {
    const [params, setParams] = useSearchParams();
    const status = params.get('status') || '';
    const [rows, setRows] = useState(null);
    const [search, setSearch] = useState('');
    const [error, setError] = useState('');
    const [tol, setTol] = useState(null);
    const [tolMsg, setTolMsg] = useState('');
    const { user } = useAuth();
    const isAdmin = user?.role === 'factory_admin';

    useEffect(() => {
        const t = setTimeout(() => purchasingApi.grns({ status: status || undefined, q: search.trim() || undefined })
            .then(res => setRows(res.data)).catch(err => setError(apiError(err, 'Failed to load goods receipts.'))), 250);
        return () => clearTimeout(t);
    }, [status, search]);
    useEffect(() => {
        purchasingApi.settings().then(res => setTol(String(res.data.over_receipt_tolerance_pct))).catch(() => {});
    }, []);
    const saveTol = async () => {
        setTolMsg('');
        try { const res = await purchasingApi.saveSettings({ over_receipt_tolerance_pct: Number(tol) }); setTol(String(res.data.over_receipt_tolerance_pct)); setTolMsg('Saved.'); }
        catch (err) { setTolMsg(apiError(err, 'Failed.')); }
    };

    return (
        <div>
            <PageHeader title={status === 'PENDING_APPROVAL' ? 'GRN approvals' : 'Goods receipts'}
                subtitle={status === 'PENDING_APPROVAL' ? 'Receipts over the tolerance, waiting for the purchase manager. Nothing is in stock until approved.' : 'Every receipt against a purchase order.'}
                actions={<>
                    <select className="px-3 py-2 text-sm border border-slate-300 rounded-lg" value={status} onChange={e => setParams(e.target.value ? { status: e.target.value } : {})} aria-label="Filter by status">
                        <option value="">All statuses</option>
                        {Object.entries(GRN_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                    <SearchInput value={search} onChange={setSearch} placeholder="GRN, challan, PO, supplier" />
                </>} />
            <ErrorBox text={error} />
            {!rows ? <Loading /> : (
                <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
                    <table className="w-full text-sm min-w-[820px]">
                        <thead className="bg-slate-50 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                            <tr><th className="px-4 py-2.5">GRN</th><th className="px-4 py-2.5">PO</th><th className="px-4 py-2.5">Supplier · challan</th><th className="px-4 py-2.5 text-right">Lines</th><th className="px-4 py-2.5">Received by</th><th className="px-4 py-2.5">Status</th><th className="px-4 py-2.5 w-10" /></tr>
                        </thead>
                        <tbody>
                            {rows.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">{status === 'PENDING_APPROVAL' ? 'Nothing waiting for approval.' : 'No goods receipts yet.'}</td></tr>}
                            {rows.map(r => (
                                <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50">
                                    <td className="px-4 py-2.5"><Link to={`/v3/purchasing/grns/${r.id}`} className="font-semibold text-indigo-700 hover:underline whitespace-nowrap">{r.grn_no}</Link><span className="block text-xs text-slate-500">{fmtDate(r.received_date)}</span></td>
                                    <td className="px-4 py-2.5"><Link to={`/v3/purchasing/orders/${r.po_id}`} className="text-indigo-700 hover:underline">{r.po_no}</Link></td>
                                    <td className="px-4 py-2.5">{r.supplier_name}<span className="block text-xs text-slate-500">challan {r.challan_no}</span></td>
                                    <td className="px-4 py-2.5 text-right">{r.line_count}{r.rejected > 0 && <span className="block text-[11px] text-rose-600">rejections</span>}</td>
                                    <td className="px-4 py-2.5 text-slate-600">{r.received_by_name || '—'}</td>
                                    <td className="px-4 py-2.5"><span className={`text-[11px] font-black px-2 py-0.5 rounded border ${GRN_STATUS[r.status].cls}`}>{GRN_STATUS[r.status].label}</span></td>
                                    <td className="px-4 py-2.5"><Link to={`/v3/purchasing/grns/${r.id}`} className="text-slate-400 hover:text-indigo-600" aria-label={`Open ${r.grn_no}`}><ChevronRight size={16} /></Link></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            {tol != null && (
                <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-slate-600">
                    Over-receipt tolerance: {isAdmin ? <><input className={`${inputCls} !w-20 !py-1`} type="number" min="0" max="100" step="0.5" value={tol} onChange={e => setTol(e.target.value)} aria-label="Over-receipt tolerance %" />% <SecondaryButton onClick={saveTol}>Save</SecondaryButton></> : <b>{tol}%</b>}
                    <span className="text-xs text-slate-500">— receiving more than ordered beyond this needs the purchase manager's approval.</span> {tolMsg && <span className="text-xs">{tolMsg}</span>}
                </div>
            )}
        </div>
    );
}

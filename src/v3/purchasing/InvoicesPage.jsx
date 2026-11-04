// Supplier invoices: register with match status, supplier / date / search
// filters, Excel; factory admin sets the match tolerance here.
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, FileSpreadsheet } from 'lucide-react';
import * as XLSX from 'xlsx';
import { purchasingApi } from '../api/purchasingApi';
import { apiError } from '../api/mastersApi';
import { PageHeader, SearchInput, inputCls, PrimaryButton, SecondaryButton, ErrorBox, Loading } from '../components/ui';
import { fmtDate, todayLocal } from '../salesOrders/SalesOrderStatusBadge';
import { useAuth } from '../../context/AuthContext';
import { inr } from './poShared';
import { INVOICE_STATUS, APPROVAL_STATUS } from './returnShared';

export default function InvoicesPage() {
    const navigate = useNavigate();
    const { user } = useAuth();
    const isAdmin = user?.role === 'factory_admin';
    const [perms, setPerms] = useState({});
    const [rows, setRows] = useState(null);
    const [status, setStatus] = useState('');
    const [search, setSearch] = useState('');
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');
    const [approval, setApproval] = useState('');
    const [tol, setTol] = useState('');
    const [msg, setMsg] = useState('');
    const [error, setError] = useState('');
    useEffect(() => {
        purchasingApi.permissions().then(res => setPerms(res.data)).catch(() => {});
        purchasingApi.settings().then(res => setTol(String(res.data.invoice_match_tolerance_pct))).catch(() => {});
    }, []);
    useEffect(() => {
        const t = setTimeout(() => purchasingApi.invoices({ status: status || undefined, approval: approval || undefined, q: search.trim() || undefined, from: from || undefined, to: to || undefined })
            .then(res => setRows(res.data)).catch(err => setError(apiError(err, 'Failed to load invoices.'))), 250);
        return () => clearTimeout(t);
    }, [status, approval, search, from, to]);
    const saveTol = async () => {
        setMsg('');
        try { await purchasingApi.saveSettings({ invoice_match_tolerance_pct: Number(tol) }); setMsg('Saved.'); } catch (err) { setMsg(apiError(err, 'Failed.')); }
    };
    const excel = () => {
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet((rows || []).map(r => ({
            Date: r.invoice_date, Supplier: r.supplier_name, GSTIN: r.supplier_gstin || '', 'Invoice no.': r.invoice_no, HSN: r.hsn_codes || '', GRNs: r.grns || '', 'Taxable (Rs)': r.taxable_amount, 'CGST (Rs)': r.cgst_amount, 'SGST (Rs)': r.sgst_amount, 'IGST (Rs)': r.igst_amount, 'TCS (Rs)': r.tcs_amount, 'Round-off (Rs)': r.round_off_amount,
            'Total (Rs)': r.total_amount, Stage: r.status === 'CANCELLED' ? 'Cancelled' : APPROVAL_STATUS[r.approval_status].label, Match: INVOICE_STATUS[r.status].label, Warnings: r.warning_count, 'Entered by': r.created_by_name || '', 'Approved by': r.approved_by_name || '',
        }))), 'Supplier invoices');
        XLSX.writeFile(wb, `supplier-invoices-${todayLocal()}.xlsx`);
    };
    const live = (rows || []).filter(r => r.status !== 'CANCELLED' && r.approval_status !== 'DRAFT');

    return (
        <div>
            <PageHeader title="Supplier invoices" subtitle={`Each invoice is matched against its POs and goods receipts. Shown: ${live.length} live, ₹${inr(live.reduce((s, r) => s + r.total_amount, 0))}.`}
                actions={<>
                    <SecondaryButton onClick={excel} disabled={!rows?.length}><FileSpreadsheet size={14} /> Excel</SecondaryButton>
                    {perms.invoice && <PrimaryButton onClick={() => navigate('/v3/purchasing/invoices/new')}><Plus size={14} /> Enter invoice</PrimaryButton>}
                </>} />
            <div className="flex flex-wrap items-center gap-2 mb-3">
                <SearchInput value={search} onChange={setSearch} placeholder="Invoice no., supplier" />
                <select className="px-3 py-2 text-sm border border-slate-300 rounded-lg" value={approval} onChange={e => setApproval(e.target.value)} aria-label="Stage">
                    <option value="">All stages</option>{['DRAFT', 'SUBMITTED', 'ON_HOLD', 'APPROVED'].map(k => <option key={k} value={k}>{APPROVAL_STATUS[k].label}</option>)}
                </select>
                <select className="px-3 py-2 text-sm border border-slate-300 rounded-lg" value={status} onChange={e => setStatus(e.target.value)} aria-label="Match status">
                    <option value="">All</option>{Object.entries(INVOICE_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
                <label className="text-sm text-slate-600 flex items-center gap-1">From <input type="date" className="px-2 py-1.5 text-sm border border-slate-300 rounded-lg" value={from} onChange={e => setFrom(e.target.value)} /></label>
                <label className="text-sm text-slate-600 flex items-center gap-1">To <input type="date" className="px-2 py-1.5 text-sm border border-slate-300 rounded-lg" value={to} onChange={e => setTo(e.target.value)} /></label>
                <span className="ml-auto text-sm text-slate-600 flex items-center gap-1.5">Match tolerance {isAdmin ? <><input className={`${inputCls} !w-20 !py-1`} type="number" min="0" max="100" step="0.5" value={tol} onChange={e => setTol(e.target.value)} aria-label="Invoice match tolerance %" />% <SecondaryButton onClick={saveTol}>Save</SecondaryButton></> : <b>{tol}%</b>}{msg && <span className="text-xs">{msg}</span>}</span>
            </div>
            <ErrorBox text={error} />
            {!rows ? <Loading /> : (
                <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
                    <table className="w-full text-sm min-w-[880px]">
                        <thead className="bg-slate-50 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                            <tr><th className="px-3 py-2.5">Invoice</th><th className="px-3 py-2.5">Date</th><th className="px-3 py-2.5">Supplier</th><th className="px-3 py-2.5">GRNs</th><th className="px-3 py-2.5 text-right">Total ₹</th><th className="px-3 py-2.5">Match</th></tr>
                        </thead>
                        <tbody>
                            {rows.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">No supplier invoices.</td></tr>}
                            {rows.map(r => (
                                <tr key={r.id} className={`border-t border-slate-100 ${r.status === 'CANCELLED' ? 'opacity-60' : ''}`}>
                                    <td className="px-3 py-2.5"><Link to={`/v3/purchasing/invoices/${r.id}`} className="font-semibold text-indigo-700 hover:underline">{r.invoice_no}</Link></td>
                                    <td className="px-3 py-2.5 whitespace-nowrap">{fmtDate(r.invoice_date)}</td>
                                    <td className="px-3 py-2.5">{r.supplier_name}</td>
                                    <td className="px-3 py-2.5 text-xs text-slate-600">{r.grns}</td>
                                    <td className="px-3 py-2.5 text-right tabular-nums">{inr(r.total_amount)}</td>
                                    <td className="px-3 py-2.5"><span className={`text-[11px] font-black px-2 py-0.5 rounded border ${APPROVAL_STATUS[r.status === 'CANCELLED' ? 'CANCELLED' : r.approval_status].cls}`}>{APPROVAL_STATUS[r.status === 'CANCELLED' ? 'CANCELLED' : r.approval_status].label}</span>{r.status !== 'CANCELLED' && r.status !== 'NOT_CHECKED' && <span className={`ml-1 text-[11px] font-black px-2 py-0.5 rounded border ${INVOICE_STATUS[r.status].cls}`}>{INVOICE_STATUS[r.status].label}</span>}</td>
                                </tr>
                            ))}
                            {rows.length > 0 && (
                                <tr className="border-t-2 border-slate-300 bg-slate-50 font-black text-slate-700">
                                    <td className="px-3 py-2.5" colSpan={4}>Total · {live.length} invoice(s), not counting drafts and cancelled</td>
                                    <td className="px-3 py-2.5 text-right tabular-nums">{inr(live.reduce((s, r) => s + r.total_amount, 0))}</td><td />
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

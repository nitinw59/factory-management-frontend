// Debit notes to suppliers (4 Nov 2026, invoice phase 2): what we claim back, and goods returned after they were billed that
// have no debit note yet.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { purchasingApi } from '../api/purchasingApi';
import { apiError } from '../api/mastersApi';
import { PageHeader, SearchInput, ErrorBox, Loading } from '../components/ui';
import { fmtDate } from '../salesOrders/SalesOrderStatusBadge';
import { inr } from './poShared';
import { DEBIT_STATUS } from './returnShared';

const fmt = (v) => Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 3 });

export default function DebitNotesPage() {
    const [rows, setRows] = useState(null);
    const [toRaise, setToRaise] = useState([]);
    const [perms, setPerms] = useState({});
    const [q, setQ] = useState('');
    const [status, setStatus] = useState('');
    const [error, setError] = useState('');
    useEffect(() => {
        purchasingApi.permissions().then(res => setPerms(res.data)).catch(() => {});
        purchasingApi.debitNotesToRaise().then(res => setToRaise(res.data)).catch(err => setError(apiError(err, 'Failed to load.')));
    }, []);
    useEffect(() => {
        const t = setTimeout(() => purchasingApi.debitNotes({ q: q.trim() || undefined, status: status || undefined }).then(res => setRows(res.data)).catch(err => setError(apiError(err, 'Failed to load debit notes.'))), 250);
        return () => clearTimeout(t);
    }, [q, status]);
    const live = (rows || []).filter(r => r.status !== 'CANCELLED');
    return (
        <div>
            <PageHeader title="Debit notes" subtitle="What we claim back from suppliers. To raise one, open an approved invoice and choose Debit note." />
            <ErrorBox text={error} />
            {toRaise.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl mb-4 overflow-x-auto">
                    <p className="px-3 pt-3 text-sm font-black text-amber-900">To debit: goods returned after they were billed</p>
                    <table className="w-full text-sm min-w-[720px] mt-2">
                        <thead className="text-left text-xs font-bold text-amber-900/70 uppercase tracking-wider"><tr><th className="px-3 py-1.5">Invoice</th><th className="px-3 py-1.5">Supplier</th><th className="px-3 py-1.5">Item</th><th className="px-3 py-1.5 text-right">Qty</th><th className="px-3 py-1.5 text-right">Value ₹</th><th /></tr></thead>
                        <tbody>
                            {toRaise.map(t => <tr key={t.invoice_line_id} className="border-t border-amber-200"><td className="px-3 py-1.5"><Link to={`/v3/purchasing/invoices/${t.invoice_id}`} className="font-semibold text-indigo-700 hover:underline">{t.invoice_no}</Link></td><td className="px-3 py-1.5">{t.supplier_name}</td><td className="px-3 py-1.5">{t.label}<span className="block text-xs text-slate-600">{t.grn_no}</span></td><td className="px-3 py-1.5 text-right tabular-nums">{fmt(t.over_billed)} {t.purchase_uom}</td><td className="px-3 py-1.5 text-right tabular-nums">{inr(t.value)}</td><td className="px-3 py-1.5 text-right">{perms.invoice && <Link to={`/v3/purchasing/debit-notes/new?invoice=${t.invoice_id}&reason=RETURN`} className="font-semibold text-indigo-700 hover:underline">Raise</Link>}</td></tr>)}
                            <tr className="border-t-2 border-amber-300 font-black text-amber-900"><td className="px-3 py-1.5" colSpan={4}>Total · {toRaise.length} line(s)</td><td className="px-3 py-1.5 text-right tabular-nums">{inr(toRaise.reduce((s, t) => s + t.value, 0))}</td><td /></tr>
                        </tbody>
                    </table>
                </div>
            )}
            <div className="flex flex-wrap items-center gap-2 mb-3">
                <div className="w-72"><SearchInput value={q} onChange={setQ} placeholder="Debit note, invoice or supplier…" /></div>
                <select className="px-3 py-2 text-sm border border-slate-300 rounded-lg" value={status} onChange={e => setStatus(e.target.value)} aria-label="Status"><option value="">All</option>{Object.entries(DEBIT_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
            </div>
            {!rows ? <Loading /> : (
                <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
                    <table className="w-full text-sm min-w-[820px]">
                        <thead className="bg-slate-50 text-left text-xs font-bold text-slate-500 uppercase tracking-wider"><tr><th className="px-3 py-2.5">Debit note</th><th className="px-3 py-2.5">Date</th><th className="px-3 py-2.5">Supplier</th><th className="px-3 py-2.5">Invoice</th><th className="px-3 py-2.5">For</th><th className="px-3 py-2.5 text-right">Total ₹</th><th className="px-3 py-2.5">Status</th></tr></thead>
                        <tbody>
                            {rows.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">No debit notes.</td></tr>}
                            {rows.map(r => <tr key={r.id} className={`border-t border-slate-100 ${r.status === 'CANCELLED' ? 'opacity-60' : ''}`}><td className="px-3 py-2.5"><Link to={`/v3/purchasing/debit-notes/${r.id}`} className="font-semibold text-indigo-700 hover:underline">{r.debit_no}</Link></td><td className="px-3 py-2.5 whitespace-nowrap">{fmtDate(r.note_date)}</td><td className="px-3 py-2.5">{r.supplier_name}</td><td className="px-3 py-2.5"><Link to={`/v3/purchasing/invoices/${r.invoice_id}`} className="text-indigo-700 hover:underline">{r.invoice_no}</Link></td><td className="px-3 py-2.5 text-xs">{r.reason_label}</td><td className="px-3 py-2.5 text-right tabular-nums">{inr(r.total_amount)}</td><td className="px-3 py-2.5"><span className={`text-[11px] font-black px-2 py-0.5 rounded border ${DEBIT_STATUS[r.status].cls}`}>{DEBIT_STATUS[r.status].label}</span></td></tr>)}
                            {rows.length > 0 && <tr className="border-t-2 border-slate-300 bg-slate-50 font-black text-slate-700"><td className="px-3 py-2.5" colSpan={5}>Total · {live.length} debit note(s), not counting cancelled</td><td className="px-3 py-2.5 text-right tabular-nums">{inr(live.reduce((s, r) => s + r.total_amount, 0))}</td><td /></tr>}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

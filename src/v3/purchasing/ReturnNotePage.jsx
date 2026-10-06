// One return note: supplier, GRN / PO, lines (rejected at receipt / from stock, rolls), value, PDF.
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, FileDown } from 'lucide-react';
import { purchasingApi } from '../api/purchasingApi';
import { adminApi } from '../../api/adminApi';
import { apiError } from '../api/mastersApi';
import { SecondaryButton, ErrorBox, Loading } from '../components/ui';
import { fmtDate } from '../salesOrders/SalesOrderStatusBadge';
import { inr } from './poShared';
import { SOURCE_LABEL, exportReturnNotePdf } from './returnShared';

const fmt = (v) => Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 3 });

export default function ReturnNotePage() {
    const { id } = useParams();
    const [rn, setRn] = useState(null);
    const [error, setError] = useState('');
    useEffect(() => { purchasingApi.returnNote(id).then(res => setRn(res.data)).catch(err => setError(apiError(err, 'Failed to load the return note.'))); }, [id]);
    if (!rn) return <div>{error ? <ErrorBox text={error} /> : <Loading />}</div>;
    const pdf = async () => {
        let company = null;
        try { company = (await adminApi.getCompanyProfile()).data; } catch { /* letterhead is optional */ }
        exportReturnNotePdf(rn, company);
    };
    return (
        <div>
            <Link to="/v3/purchasing/return-notes" className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-indigo-600 mb-3"><ArrowLeft size={15} /> Return notes</Link>
            <div className="flex flex-wrap items-center gap-3 mb-2">
                <h1 className="text-2xl font-black text-slate-900">{rn.rn_no}</h1>
                <span className="text-sm text-slate-500">{fmtDate(rn.return_date)} · to {rn.supplier_name} · from <Link to={`/v3/purchasing/grns/${rn.grn_id}`} className="text-indigo-700 font-semibold hover:underline">{rn.grn_no}</Link> / <Link to={`/v3/purchasing/orders/${rn.po_id}`} className="text-indigo-700 font-semibold hover:underline">{rn.po_no}</Link></span>
                <SecondaryButton onClick={pdf}><FileDown size={14} /> PDF</SecondaryButton>
            </div>
            <p className="text-sm mb-1"><b>Reason:</b> {rn.reason}</p>
            <p className={`text-sm mb-3 ${rn.replacement_expected ? 'text-indigo-700' : 'text-slate-600'}`}>{rn.replacement_expected ? 'Replacement expected against the PO.' : 'No replacement (credit note expected).'}{rn.vehicle_no ? ` · Vehicle ${rn.vehicle_no}` : ''}{rn.created_by_name ? ` · by ${rn.created_by_name}` : ''}</p>
            <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
                <table className="w-full text-sm min-w-[760px]">
                    <thead className="bg-slate-50 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                        <tr><th className="px-3 py-2.5">#</th><th className="px-3 py-2.5">Item</th><th className="px-3 py-2.5">Type</th><th className="px-3 py-2.5 text-right">Qty</th><th className="px-3 py-2.5 text-right">Rate ₹</th><th className="px-3 py-2.5 text-right">Value ₹</th><th className="px-3 py-2.5 text-right">GST ₹</th></tr>
                    </thead>
                    <tbody>
                        {rn.lines.map(l => (
                            <tr key={l.id} className="border-t border-slate-100 align-top">
                                <td className="px-3 py-2">{l.line_no}</td>
                                <td className="px-3 py-2 font-semibold">{l.label}{l.rolls.length > 0 && <span className="block text-xs font-normal text-slate-500">Rolls {l.rolls.map(r => `${r.roll_no} (${fmt(r.qty)})`).join(', ')}</span>}</td>
                                <td className="px-3 py-2">{SOURCE_LABEL[l.source]}</td>
                                <td className="px-3 py-2 text-right tabular-nums">{fmt(l.qty)} {l.purchase_uom}</td>
                                <td className="px-3 py-2 text-right tabular-nums">{inr(l.rate)}</td>
                                <td className="px-3 py-2 text-right tabular-nums">{inr(l.value)}</td>
                                <td className="px-3 py-2 text-right tabular-nums">{inr(l.gst)} <span className="text-xs text-slate-500">({l.gst_pct}%)</span></td>
                            </tr>
                        ))}
                    </tbody>
                    <tfoot className="border-t-2 border-slate-200 font-bold text-right tabular-nums"><tr><td colSpan={5} className="px-3 py-2 text-left">Total ₹{inr(rn.totals.total)} with GST</td><td className="px-3 py-2">{inr(rn.totals.taxable)}</td><td className="px-3 py-2">{inr(rn.totals.gst)}</td></tr></tfoot>
                </table>
            </div>
        </div>
    );
}

// One material issue slip: order, stage, receiver, lines (rolls for fabric), the returns made on it, PDF.
// 21 Oct 2026: "Return from production" is closed — fabric comes back on a return slip (Production → Return slips: the
// cutting manager drafts, the fabric store receives); trims on the store's return slip (to build). Past returns stay listed.
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, FileDown } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { materialIssueApi } from '../api/materialIssueApi';
import { apiError } from '../api/mastersApi';
import { SecondaryButton, ErrorBox, Loading } from '../components/ui';
import { fmtDate } from '../salesOrders/SalesOrderStatusBadge';

const fmt = (v, uom) => Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: uom === 'pcs' ? 0 : 3 });

function pdf(s) {
    const doc = new jsPDF();
    doc.setFontSize(14); doc.setFont(undefined, 'bold'); doc.text(`MATERIAL ISSUE SLIP  ${s.issue_no}`, 14, 16); doc.setFont(undefined, 'normal'); doc.setFontSize(9);
    doc.text(`Date: ${s.issue_date.split('-').reverse().join('/')}   Order: ${s.order_no} (${s.customer_name})   Stage: ${s.stage}`, 14, 23);
    doc.text(`Received by: ${s.received_by}${s.department_name ? `   Department: ${s.department_name}` : ''}   Issued by: ${s.issued_by_name || '—'}`, 14, 28);
    autoTable(doc, {
        startY: 33, head: [['#', 'Item', 'Qty', 'Returned', 'Rolls']],
        body: s.lines.map(l => [l.line_no, `${l.label}${l.mixed_lots ? ' (MIXED DYE LOTS)' : ''}`, `${fmt(l.qty, l.uom)} ${l.uom}`, l.returned_qty ? fmt(l.returned_qty, l.uom) : '', l.rolls.map(r => `${r.roll_no}${r.dye_lot ? `/${r.dye_lot}` : ''}: ${fmt(r.qty)}`).join(', ')]),
        styles: { fontSize: 8 }, headStyles: { fillColor: [79, 70, 229] },
    });
    const y = doc.lastAutoTable.finalY + 22;
    doc.text('Issued by', 14, y); doc.text('Received by', 90, y); doc.text('Checked by', 160, y);
    doc.save(`MaterialIssue-${s.issue_no.replace(/[^\w-]+/g, '-')}.pdf`);
}

export default function MaterialIssueSlipPage() {
    const { id } = useParams();
    const [s, setS] = useState(null);
    const [error, setError] = useState('');
    const load = useCallback(() => materialIssueApi.issue(id).then(res => setS(res.data)).catch(err => setError(apiError(err, 'Failed to load the slip.'))), [id]);
    useEffect(() => { load(); }, [load]);
    if (!s) return <div>{error ? <ErrorBox text={error} /> : <Loading />}</div>;
    return (
        <div>
            <Link to="/v3/material-issue?tab=slips" className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-indigo-600 mb-3"><ArrowLeft size={15} /> Issue slips</Link>
            <div className="flex flex-wrap items-center gap-3 mb-2">
                <h1 className="text-2xl font-black text-slate-900">{s.issue_no}</h1>
                <span className="text-sm text-slate-500">{fmtDate(s.issue_date)} · <Link to={`/v3/planning/orders/${s.order_id}`} className="text-indigo-700 font-semibold hover:underline">{s.order_no}</Link> · {s.stage} · to {s.received_by}{s.department_name ? ` (${s.department_name})` : ''}{s.cut_batch_code ? ` · batch ${s.cut_batch_code}` : ''} · by {s.issued_by_name || '—'}</span>
            </div>
            {s.gate_override && <p className="mb-2 text-sm text-rose-700">Issued to cutting under a release for cutting (order not fully allocated).</p>}
            <div className="flex gap-2 mb-3">
                <SecondaryButton onClick={() => pdf(s)}><FileDown size={14} /> PDF</SecondaryButton>
            </div>
            {s.lines.some(l => l.kind === 'FABRIC') && <p className="mb-3 text-xs text-slate-500">Fabric left over comes back on a <Link to="/v3/material-returns" className="font-semibold text-indigo-700 hover:underline">return slip</Link> — the cutting manager drafts it, the fabric store receives it.</p>}
            <ErrorBox text={error} />
            <div className="space-y-3 mb-4">
                {s.lines.map(l => (
                    <div key={l.id} className="bg-white border border-slate-200 rounded-xl p-4">
                        <p className="font-bold">{l.line_no}. {l.label} {l.mixed_lots && <span className="ml-1 text-[11px] font-black px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-300">mixed dye lots</span>}</p>
                        <p className="text-sm">Issued <b>{fmt(l.qty, l.uom)} {l.uom}</b>{l.returned_qty > 0 && <> · returned {fmt(l.returned_qty, l.uom)} · net {fmt(l.open_qty, l.uom)}</>}</p>
                        {l.rolls.length > 0 && <p className="text-xs text-slate-600 mt-1">{l.rolls.map(r => `${r.roll_no}${r.dye_lot ? ` (lot ${r.dye_lot})` : ''}: ${fmt(r.qty)}${r.returned_qty ? `, ${fmt(r.returned_qty)} back` : ''}`).join(' · ')}</p>}
                    </div>
                ))}
            </div>
            {s.returns.length > 0 && <div className="bg-white border border-slate-200 rounded-xl p-4"><p className="text-xs font-black uppercase tracking-wider text-slate-500 mb-2">Returns</p>{s.returns.map(r => <p key={r.id} className="text-sm"><span className="text-xs text-slate-400 mr-2">{new Date(r.created_at).toLocaleString()}</span>Line {r.line_no}: {fmt(r.qty)} back{r.user_name ? ` · ${r.user_name}` : ''} — {r.reason}</p>)}</div>}
        </div>
    );
}

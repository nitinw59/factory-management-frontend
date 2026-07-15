import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { trimLossApi } from '../../api/trimLossApi';
import { caseStatusOf, debitStatusOf } from './trimLossStatusConfig';
import StatusTimeline from './StatusTimeline';
import {
    Loader2, ArrowLeft, RefreshCw, AlertCircle, PackageX, FileText, Users, History, Link2, ScrollText,
} from 'lucide-react';

export const fmtDateTime = (d) => d ? new Date(d).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
export const fmtMoney = (v) => `₹${parseFloat(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const variantText = (l) =>
    [`${l?.color_number ? `${l.color_number} - ` : ''}${l?.color_name || ''}`.trim(), l?.variant_size].filter(Boolean).join(' / ');

// Derive the item label + outstanding qty defensively (backend shape isn't pinned).
const itemLabel = (c) => {
    const name = c.item_name || c.item?.name || c.trim_item_name || '—';
    const v = variantText(c.item ? c.item : c);
    return v ? `${name} — ${v}` : name;
};
const outstandingQtyOf = (c) => {
    if (c.outstanding_qty != null) return Number(c.outstanding_qty);
    const missing = Number(c.missing_qty) || 0;
    const found = Number(c.found_qty) || 0;
    return Math.max(0, missing - found);
};

const Tile = ({ label, children }) => (
    <div>
        <p className="text-[10px] uppercase tracking-wider font-bold text-gray-400">{label}</p>
        <p className="font-semibold text-gray-800 mt-0.5">{children}</p>
    </div>
);

const Section = ({ icon: Icon, title, children, right }) => (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center">
                <Icon className="w-4 h-4 mr-2 text-indigo-600" />
                <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider">{title}</h3>
            </div>
            {right}
        </div>
        <div className="p-5">{children}</div>
    </div>
);

const CaseDetailPage = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);
    const [refreshing, setRefreshing] = useState(false);

    const fetchCase = useCallback(async () => {
        setRefreshing(true);
        setError(null);
        try {
            const res = await trimLossApi.getCase(id);
            console.log('[trimloss] getCase raw:', res.data);
            setData(res.data);
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to load case.');
        } finally {
            setRefreshing(false);
        }
    }, [id]);

    useEffect(() => { fetchCase(); }, [fetchCase]);

    if (error && !data) {
        return (
            <div className="max-w-4xl mx-auto">
                <button onClick={() => navigate(-1)} className="text-sm text-indigo-600 hover:underline flex items-center font-semibold mb-4">
                    <ArrowLeft className="w-4 h-4 mr-2" /> Back
                </button>
                <div className="p-4 bg-red-50 text-red-700 rounded-xl border border-red-200 flex items-center text-sm font-medium">
                    <AlertCircle className="h-5 w-5 mr-3 shrink-0" /> {error}
                </div>
            </div>
        );
    }

    if (!data) {
        return <div className="flex justify-center p-16"><Loader2 className="animate-spin h-10 w-10 text-indigo-600" /></div>;
    }

    const c = data;
    const meta = caseStatusOf(c.status);
    const outstanding = outstandingQtyOf(c);
    const slip = c.original_slip || c.slip || null;
    const slipNumber = c.issue_number || c.original_issue_number || slip?.issue_number;
    const slipLines = slip?.lines || c.slip_lines || [];
    const debitNotes = c.debit_notes || [];
    const siblings = c.sibling_cases || [];
    const history = c.status_history || c.history || [];

    return (
        <div className="max-w-4xl mx-auto space-y-5">
            <div className="flex items-center justify-between">
                <button onClick={() => navigate(-1)} className="text-sm text-indigo-600 hover:underline flex items-center font-semibold">
                    <ArrowLeft className="w-4 h-4 mr-2" /> Back
                </button>
                <button onClick={fetchCase} disabled={refreshing} className="p-2 bg-white border border-gray-300 rounded-lg shadow-sm hover:bg-gray-50 text-gray-600 disabled:opacity-50" title="Refresh">
                    <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin text-indigo-600' : ''}`} />
                </button>
            </div>

            {error && (
                <div className="p-3 bg-red-50 text-red-700 rounded-lg border border-red-200 flex items-center text-sm font-medium">
                    <AlertCircle className="h-4 w-4 mr-2 shrink-0" /> {error}
                </div>
            )}

            {/* Header */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="min-w-0">
                        <div className="flex items-center gap-3 flex-wrap">
                            <h1 className="text-2xl font-extrabold text-gray-900 flex items-center">
                                <PackageX className="w-6 h-6 mr-2.5 text-red-600" /> {c.case_number || `Case #${id}`}
                            </h1>
                            <span className={`px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider rounded-full border ${meta.badge}`}>{meta.label}</span>
                        </div>
                        <p className="text-sm text-gray-600 mt-2 font-semibold">{itemLabel(c)}</p>
                        {c.notes && <p className="text-sm text-gray-500 mt-1 italic">“{c.notes}”</p>}
                    </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-5 pt-4 border-t border-gray-100 text-sm">
                    <Tile label="Outstanding qty"><span className="font-mono text-lg">{outstanding}</span></Tile>
                    <Tile label="Missing / found"><span className="font-mono">{Number(c.missing_qty) || 0}{c.found_qty != null ? ` / ${c.found_qty}` : ''}</span></Tile>
                    <Tile label="Unit cost">{Number(c.unit_cost) > 0 ? fmtMoney(c.unit_cost) : '—'}</Tile>
                    <Tile label="Loss value">{c.loss_value != null ? fmtMoney(c.loss_value) : '—'}</Tile>
                    {(c.production_line_name || c.line_name) && <Tile label="Production line">{c.production_line_name || c.line_name}</Tile>}
                    {(c.batch_code || c.production_batch_id) && <Tile label="Batch">{c.batch_code ? `${c.batch_code}${c.production_batch_id ? ` · #${c.production_batch_id}` : ''}` : `#${c.production_batch_id}`}</Tile>}
                    {c.reported_by_name && <Tile label="Reported by">{c.reported_by_name}</Tile>}
                    {c.created_at && <Tile label="Reported at">{fmtDateTime(c.created_at)}</Tile>}
                </div>
            </div>

            {/* Custody trail — the original signed slip + its matching lines */}
            <Section
                icon={FileText}
                title="Custody trail — original slip"
                right={slipNumber && <span className="font-mono text-sm font-bold text-gray-700">{slipNumber}</span>}
            >
                {!slip && !slipNumber ? (
                    <p className="text-sm text-gray-400 font-medium">No original slip linked to this case.</p>
                ) : (
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                            {(slip?.issued_to_name || c.issued_to_name) && <Tile label="Taken by">{slip?.issued_to_name || c.issued_to_name}</Tile>}
                            {(slip?.created_at || c.slip_created_at) && <Tile label="Signed">{fmtDateTime(slip?.created_at || c.slip_created_at)}</Tile>}
                            {(slip?.delivery_line_name || c.delivery_line_name) && <Tile label="Delivery line">{slip?.delivery_line_name || c.delivery_line_name}</Tile>}
                            {(slip?.total_value != null) && <Tile label="Slip value">{fmtMoney(slip.total_value)}</Tile>}
                        </div>
                        {slipLines.length > 0 && (
                            <div className="border border-gray-200 rounded-lg overflow-hidden">
                                <table className="w-full text-sm">
                                    <thead className="bg-gray-50 text-[10px] uppercase text-gray-500 font-bold">
                                        <tr>
                                            <th className="px-3 py-2 text-left">Item</th>
                                            <th className="px-3 py-2 text-right">Qty</th>
                                            <th className="px-3 py-2 text-right">Unit cost</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {slipLines.map((l, i) => (
                                            <tr key={i} className={l.is_case_line || l.matched ? 'bg-red-50/50' : ''}>
                                                <td className="px-3 py-2 text-gray-700"><span className="font-semibold">{l.item_name}</span>{variantText(l) ? ` — ${variantText(l)}` : ''}</td>
                                                <td className="px-3 py-2 text-right font-mono">{l.qty}</td>
                                                <td className="px-3 py-2 text-right font-mono">{Number(l.unit_cost) > 0 ? fmtMoney(l.unit_cost) : '—'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}
            </Section>

            {/* Debit notes */}
            {debitNotes.length > 0 && (
                <Section icon={ScrollText} title="Debit notes">
                    <div className="space-y-2">
                        {debitNotes.map((n, i) => {
                            const dmeta = debitStatusOf(n.status);
                            return (
                                <div key={n.id ?? i} className="flex items-center justify-between gap-3 border border-gray-200 rounded-lg px-3 py-2">
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="font-mono font-bold text-gray-800">{n.debit_note_number || `DN-${n.id}`}</span>
                                            <span className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full border ${dmeta.badge}`}>{dmeta.label}</span>
                                        </div>
                                        <p className="text-xs text-gray-500 mt-0.5">
                                            <span className="font-semibold text-gray-700">{n.employee_name}</span>
                                            {n.qty != null && <> · {n.qty} pcs</>}
                                            {n.reason && <> · {n.reason}</>}
                                        </p>
                                        {n.recovery_notes && <p className="text-xs text-gray-400 mt-0.5 italic">{n.recovery_notes}</p>}
                                    </div>
                                    <span className="font-mono font-bold text-gray-800 shrink-0">{fmtMoney(n.amount)}</span>
                                </div>
                            );
                        })}
                    </div>
                </Section>
            )}

            {/* Timeline */}
            <Section icon={History} title="Status timeline">
                <StatusTimeline history={history} />
            </Section>

            {/* Sibling cases — other losses on the same slip */}
            {siblings.length > 0 && (
                <Section icon={Link2} title="Other losses on this slip">
                    <div className="space-y-1.5">
                        {siblings.map((s) => {
                            const smeta = caseStatusOf(s.status);
                            return (
                                <Link
                                    key={s.id}
                                    to={`/trim-loss/cases/${s.id}`}
                                    className="flex items-center justify-between text-sm bg-white border border-gray-200 rounded px-3 py-1.5 hover:border-indigo-300"
                                >
                                    <span className="font-semibold text-gray-800">{s.case_number || `Case #${s.id}`}</span>
                                    <span className="flex items-center gap-2">
                                        {s.missing_qty != null && <span className="text-xs text-gray-500">{s.missing_qty} missing</span>}
                                        <span className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full border ${smeta.badge}`}>{smeta.label}</span>
                                    </span>
                                </Link>
                            );
                        })}
                    </div>
                </Section>
            )}
        </div>
    );
};

export default CaseDetailPage;

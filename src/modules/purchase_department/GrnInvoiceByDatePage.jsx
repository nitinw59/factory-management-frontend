import { useState, useEffect, useCallback, useRef } from 'react';
import { Loader2, AlertTriangle, Calendar, Receipt, Inbox, ChevronLeft, ChevronRight } from 'lucide-react';
import { purchaseDeptApi } from '../../api/purchaseDeptApi';
import InwardDisplayModal from './InwardDisplayModal';
import InvoiceModal, { PaymentPill, MatchPill } from './InvoiceModal';

// Local YYYY-MM-DD (not toISOString(), which shifts across midnight in any
// timezone ahead of UTC) — matches what <input type="date"> both expects and
// returns, and what the backend's date_from/date_to filters compare against
// (DATE columns, no time component).
const toDateStr = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
};
const todayStr = () => toDateStr(new Date());
const shiftDate = (dateStr, days) => {
    const d = new Date(`${dateStr}T00:00:00`);
    d.setDate(d.getDate() + days);
    return toDateStr(d);
};

const GRN_STATUS_CFG = {
    PENDING_APPROVAL: { pill: 'bg-amber-100 text-amber-700 border-amber-200',       label: 'Pending' },
    APPROVED:         { pill: 'bg-emerald-100 text-emerald-700 border-emerald-200', label: 'Approved' },
    REJECTED:         { pill: 'bg-rose-100 text-rose-700 border-rose-200',          label: 'Rejected' },
    PENDING_UPDATE:   { pill: 'bg-blue-100 text-blue-700 border-blue-200',          label: 'Edit pending' },
};

const fmt = (n) => '₹' + Math.round(n || 0).toLocaleString('en-IN');

function itemSummary(items) {
    if (!items?.length) return null;
    const names = items.slice(0, 3).map(it => {
        if (it.fabric_type_name) return it.fabric_type_name + (it.fabric_color_name ? ` ${it.fabric_color_name}` : '');
        if (it.trim_item_name)   return it.trim_item_name  + (it.variant_color_name ? ` ${it.variant_color_name}` : '');
        return it.description || 'Item';
    });
    return names.join(', ') + (items.length > 3 ? ` +${items.length - 3} more` : '');
}

export default function GrnInvoiceByDatePage() {
    const [date, setDate]         = useState(todayStr());
    const [grns, setGrns]         = useState([]);
    const [invoices, setInvoices] = useState([]);
    const [loading, setLoading]   = useState(true);
    const [err, setErr]           = useState(null);

    const [openGrn, setOpenGrn]         = useState(null); // { inward, po }
    const [openInvoice, setOpenInvoice] = useState(null); // { invoice, inwards, poItems, po }
    const poItemsCache = useRef({});

    const load = useCallback(async () => {
        setLoading(true);
        setErr(null);
        try {
            const [grnRes, invRes] = await Promise.all([
                purchaseDeptApi.listAllInwards({ date_from: date, date_to: date }),
                purchaseDeptApi.listInvoices({ date_from: date, date_to: date }),
            ]);
            setGrns(grnRes.data || []);
            setInvoices(invRes.data || []);
        } catch (e) {
            setErr(e?.response?.data?.error || 'Failed to load GRNs/invoices for this date.');
        } finally {
            setLoading(false);
        }
    }, [date]);

    useEffect(() => { load(); }, [load]);

    const fetchPoItems = async (poId) => {
        if (!poId) return [];
        if (poItemsCache.current[poId]) return poItemsCache.current[poId];
        try {
            const res = await purchaseDeptApi.getOrderById(poId);
            const items = res.data?.items || res.data?.data?.items || [];
            poItemsCache.current[poId] = items;
            return items;
        } catch {
            return [];
        }
    };

    const handleOpenGrn = async (grn) => {
        const poItems = await fetchPoItems(grn.purchase_order_id);
        setOpenGrn({
            inward: grn,
            poItems,
            po: { id: grn.purchase_order_id, po_code: grn.po_code, supplier_name: grn.supplier_name },
        });
    };

    const handleOpenInvoice = async (inv) => {
        const poId = inv.purchase_order_id;
        const [poItems, inwardsRes] = await Promise.all([
            fetchPoItems(poId),
            poId ? purchaseDeptApi.getInwards(poId).catch(() => ({ data: [] })) : Promise.resolve({ data: [] }),
        ]);
        setOpenInvoice({
            invoice: inv,
            inwards: inwardsRes.data?.data || inwardsRes.data || [],
            poItems,
            po: poId ? { id: poId, po_code: inv.po_code, supplier_name: inv.supplier_name } : null,
        });
    };

    const refreshOne = () => load();

    const totalInvoiceAmt = invoices.reduce((s, inv) => s + (parseFloat(inv.amount) || 0), 0);

    return (
        <>
            {openGrn && (
                <InwardDisplayModal
                    inward={openGrn.inward}
                    poItems={openGrn.poItems}
                    poCode={openGrn.po.po_code}
                    poId={openGrn.po.id}
                    supplierName={openGrn.po.supplier_name}
                    onClose={() => setOpenGrn(null)}
                    onDeleted={() => { setOpenGrn(null); refreshOne(); }}
                />
            )}
            {openInvoice && (
                <InvoiceModal
                    inwards={openInvoice.inwards}
                    poItems={openInvoice.poItems}
                    invoice={openInvoice.invoice}
                    po={openInvoice.po}
                    initialMode="view"
                    onClose={() => setOpenInvoice(null)}
                    onSaved={() => { setOpenInvoice(null); refreshOne(); }}
                    onDeleted={() => { setOpenInvoice(null); refreshOne(); }}
                />
            )}

            <div className="max-w-4xl mx-auto space-y-6">
                {/* Page header + date picker */}
                <div className="flex items-start justify-between flex-wrap gap-3">
                    <div>
                        <h1 className="text-xl font-black text-slate-800">GRN &amp; Invoices by Date</h1>
                        <p className="text-xs text-slate-500 mt-0.5">Everything received or billed on one day, across every purchase order.</p>
                    </div>
                    <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl px-2 py-1.5 shadow-sm">
                        <button
                            onClick={() => setDate(d => shiftDate(d, -1))}
                            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition"
                            title="Previous day"
                        >
                            <ChevronLeft size={15} />
                        </button>
                        <div className="flex items-center gap-1.5 px-1">
                            <Calendar size={14} className="text-slate-400" />
                            <input
                                type="date"
                                value={date}
                                max={todayStr()}
                                onChange={e => e.target.value && setDate(e.target.value)}
                                className="text-sm font-semibold text-slate-700 outline-none bg-transparent"
                            />
                        </div>
                        <button
                            onClick={() => setDate(d => shiftDate(d, 1))}
                            disabled={date >= todayStr()}
                            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition disabled:opacity-30 disabled:cursor-not-allowed"
                            title="Next day"
                        >
                            <ChevronRight size={15} />
                        </button>
                        {date !== todayStr() && (
                            <button
                                onClick={() => setDate(todayStr())}
                                className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 px-2"
                            >
                                Today
                            </button>
                        )}
                    </div>
                </div>

                {loading && (
                    <div className="flex items-center justify-center h-48">
                        <Loader2 className="animate-spin text-slate-400" size={28} />
                    </div>
                )}

                {!loading && err && (
                    <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600">
                        <AlertTriangle size={16} /> {err}
                    </div>
                )}

                {!loading && !err && (
                    <>
                        {/* Summary strip */}
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-full">
                                {grns.length} GRN{grns.length !== 1 ? 's' : ''}
                            </span>
                            <span className="text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-3 py-1.5 rounded-full">
                                {invoices.length} invoice{invoices.length !== 1 ? 's' : ''}
                            </span>
                            {invoices.length > 0 && (
                                <span className="text-xs font-bold text-slate-700 bg-slate-100 border border-slate-200 px-3 py-1.5 rounded-full">
                                    {fmt(totalInvoiceAmt)} invoiced
                                </span>
                            )}
                        </div>

                        {/* GRNs */}
                        <div>
                            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                <Inbox size={13} /> Goods Received (GRN)
                            </p>
                            {grns.length === 0 ? (
                                <div className="text-center py-10 text-slate-400 bg-white border border-slate-200 rounded-2xl">
                                    <Inbox size={28} className="mx-auto mb-2 opacity-20" />
                                    <p className="text-sm font-semibold">No GRNs received on this date.</p>
                                </div>
                            ) : (
                                <div className="bg-white border border-slate-200 rounded-2xl divide-y divide-slate-100 shadow-sm overflow-hidden">
                                    {grns.map(g => {
                                        const scfg = GRN_STATUS_CFG[g.approval_status] || GRN_STATUS_CFG.PENDING_APPROVAL;
                                        const summary = itemSummary(g.items);
                                        return (
                                            <div
                                                key={g.id}
                                                onClick={() => handleOpenGrn(g)}
                                                className="flex items-start gap-4 px-4 py-3 hover:bg-slate-50/60 transition cursor-pointer"
                                            >
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <p className="text-sm font-black text-slate-800">{g.grn_number || `GRN #${g.id}`}</p>
                                                        <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full border ${scfg.pill}`}>
                                                            {scfg.label}
                                                        </span>
                                                        {g.invoice_id && (
                                                            <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-full">Invoiced</span>
                                                        )}
                                                    </div>
                                                    <p className="text-[11px] text-slate-500 mt-0.5">
                                                        {g.po_code || `PO #${g.purchase_order_id}`}
                                                        <span className="mx-1.5 text-slate-300">·</span>
                                                        {g.supplier_name || 'Unknown Supplier'}
                                                        {g.created_by_name ? ` · by ${g.created_by_name}` : ''}
                                                    </p>
                                                    {summary && <p className="text-[11px] text-slate-400 mt-0.5 truncate">{summary}</p>}
                                                </div>
                                                <div className="text-right shrink-0">
                                                    <p className="text-xs font-bold text-slate-600">{(g.items || []).length} item{(g.items || []).length !== 1 ? 's' : ''}</p>
                                                    <p className="text-[11px] text-indigo-500 font-semibold mt-0.5">View →</p>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Invoices */}
                        <div>
                            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                <Receipt size={13} /> Invoices
                            </p>
                            {invoices.length === 0 ? (
                                <div className="text-center py-10 text-slate-400 bg-white border border-slate-200 rounded-2xl">
                                    <Receipt size={28} className="mx-auto mb-2 opacity-20" />
                                    <p className="text-sm font-semibold">No invoices dated this day.</p>
                                </div>
                            ) : (
                                <div className="bg-white border border-slate-200 rounded-2xl divide-y divide-slate-100 shadow-sm overflow-hidden">
                                    {invoices.map(inv => (
                                        <div
                                            key={inv.id}
                                            onClick={() => handleOpenInvoice(inv)}
                                            className="flex items-start gap-4 px-4 py-3 hover:bg-slate-50/60 transition cursor-pointer"
                                        >
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <p className="text-sm font-black text-slate-800">{inv.invoice_number || `Invoice #${inv.id}`}</p>
                                                    <PaymentPill status={inv.payment_status} />
                                                    <MatchPill status={inv.match_status} />
                                                </div>
                                                <p className="text-[11px] text-slate-500 mt-0.5">
                                                    {inv.po_code || (inv.purchase_order_id ? `PO #${inv.purchase_order_id}` : 'No PO linked')}
                                                    <span className="mx-1.5 text-slate-300">·</span>
                                                    {inv.supplier_name || 'Unknown Supplier'}
                                                </p>
                                                <p className="text-[11px] text-slate-400 mt-0.5">
                                                    Covers {inv.inward_count || 0} GRN{inv.inward_count !== 1 ? 's' : ''}
                                                    {inv.scan_url ? ' · scan attached' : ''}
                                                    {inv.notes ? ' · has notes' : ''}
                                                </p>
                                            </div>
                                            <div className="text-right shrink-0">
                                                <p className="text-base font-black text-slate-800 tabular-nums">{fmt(parseFloat(inv.amount || 0))}</p>
                                                <p className="text-[11px] text-indigo-500 font-semibold mt-0.5">View →</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>
        </>
    );
}

import { useState, useEffect, useCallback, useLayoutEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    Loader2, ArrowLeft, RefreshCw, AlertTriangle, Plus, PackageCheck, FileText, Receipt,
    Package, Scissors, Tag, Calendar, Building2, ShoppingCart, CheckCircle2, Lock,
} from 'lucide-react';
import { purchaseDeptApi } from '../../api/purchaseDeptApi';
import SupplierCodePill from './SupplierCodePill';
import InwardCreateModal from './InwardCreateModal';
import InwardReviewModal from './InwardReviewModal';
import InwardDisplayModal from './InwardDisplayModal';
import InvoiceModal, { PaymentPill } from './InvoiceModal';
import PoDetailModal from './PoDetailModal';

const PO_STATUS_CFG = {
    DRAFT:           { cls: 'bg-slate-100 text-slate-600 border-slate-200',     label: 'Draft' },
    ISSUED:          { cls: 'bg-blue-100 text-blue-700 border-blue-200',         label: 'Issued' },
    PARTIAL_RECEIPT: { cls: 'bg-amber-100 text-amber-700 border-amber-200',     label: 'Partial Receipt' },
    COMPLETED:       { cls: 'bg-emerald-100 text-emerald-700 border-emerald-200', label: 'Completed' },
    CANCELLED:       { cls: 'bg-red-100 text-red-700 border-red-200',           label: 'Cancelled' },
};

const TYPE_ICON = { fabric: Package, trim: Scissors, other: Tag };

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en', { dateStyle: 'medium' }) : '—';
const fmtNum = (n, dec = 2) => Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: dec });

const computePoTotal = (po) =>
    (po?.items || []).reduce((s, i) => {
        if (i.total_price != null) return s + parseFloat(i.total_price);
        const qty   = parseFloat(i.quantity ?? 0);
        const price = parseFloat(i.unit_price ?? 0);
        return s + (qty * price);
    }, 0);

// ── Connector layer ───────────────────────────────────────────────────────────

function FlowConnectors({ containerRef, nodes, refreshKey }) {
    const [edges, setEdges] = useState([]);

    useLayoutEffect(() => {
        if (!containerRef.current) return;
        const cRect = containerRef.current.getBoundingClientRect();
        const out = [];
        nodes.forEach(({ from, to, color }) => {
            const fromEl = document.querySelector(`[data-flow-node="${from}"]`);
            const toEl   = document.querySelector(`[data-flow-node="${to}"]`);
            if (!fromEl || !toEl) return;
            const fr = fromEl.getBoundingClientRect();
            const tr = toEl.getBoundingClientRect();
            out.push({
                id: `${from}-${to}`,
                x1: fr.left + fr.width / 2 - cRect.left,
                y1: fr.bottom - cRect.top,
                x2: tr.left + tr.width / 2 - cRect.left,
                y2: tr.top - cRect.top,
                color: color || '#cbd5e1',
            });
        });
        setEdges(out);
    }, [nodes, refreshKey, containerRef]);

    return (
        <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 0 }}>
            {edges.map(e => {
                const midY = (e.y1 + e.y2) / 2;
                const d = `M ${e.x1} ${e.y1} C ${e.x1} ${midY}, ${e.x2} ${midY}, ${e.x2} ${e.y2}`;
                return (
                    <g key={e.id}>
                        <path d={d} stroke={e.color} strokeWidth="2" fill="none" strokeDasharray="0" opacity="0.7" />
                        <circle cx={e.x2} cy={e.y2} r="3" fill={e.color} />
                    </g>
                );
            })}
        </svg>
    );
}

// ── Node cards ────────────────────────────────────────────────────────────────

function PoNode({ po, total, onClick }) {
    const cfg = PO_STATUS_CFG[po.status] || PO_STATUS_CFG.DRAFT;
    return (
        <div
            data-flow-node="po"
            onClick={onClick}
            className="relative z-10 bg-white border-2 border-orange-300 hover:border-orange-400 rounded-2xl shadow-md hover:shadow-lg cursor-pointer transition-all px-5 py-4"
        >
            <div className="flex items-start gap-4">
                <div className="p-2.5 bg-orange-50 rounded-xl shrink-0">
                    <ShoppingCart size={20} className="text-orange-500" />
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-orange-500">Purchase Order</span>
                        <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${cfg.cls}`}>
                            {cfg.label}
                        </span>
                    </div>
                    <h2 className="text-lg font-black text-slate-800 mt-0.5 truncate">{po.po_code}</h2>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 mt-1.5">
                        {po.supplier_name && (
                            <span className="flex items-center gap-1"><Building2 size={11} />{po.supplier_name}</span>
                        )}
                        {po.expected_delivery_date && (
                            <span className="flex items-center gap-1"><Calendar size={11} />Due {fmtDate(po.expected_delivery_date)}</span>
                        )}
                        <span>{(po.items || []).length} line item{(po.items || []).length === 1 ? '' : 's'}</span>
                        <span className="font-bold text-slate-700">Total ₹{fmtNum(total)}</span>
                    </div>
                </div>
            </div>
        </div>
    );
}

function InwardNode({ inward, onClick }) {
    const itemCount = (inward.items || []).length;
    const linked = inward.invoice_id != null;
    return (
        <div
            data-flow-node={`inward-${inward.id}`}
            onClick={onClick}
            className={`relative z-10 bg-white border-2 ${linked ? 'border-emerald-300' : 'border-emerald-200'} hover:border-emerald-400 rounded-2xl shadow-sm hover:shadow-md cursor-pointer transition-all px-4 py-3 w-full`}
        >
            <div className="flex items-start gap-3">
                <div className="p-2 bg-emerald-50 rounded-lg shrink-0">
                    <FileText size={16} className="text-emerald-600" />
                </div>
                <div className="flex-1 min-w-0">
                    <span className="text-[9px] font-bold uppercase tracking-widest text-emerald-600">Inward · GRN</span>
                    <p className="text-sm font-black text-slate-800 truncate">
                        {inward.grn_number || `Inward #${inward.id}`}
                    </p>
                    <p className="text-[10px] text-slate-500 mt-0.5">
                        {fmtDate(inward.received_date)} · {itemCount} item{itemCount === 1 ? '' : 's'}
                    </p>
                    <div className="flex items-center gap-1.5 mt-1.5">
                        {inward.condition && (
                            <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                                inward.condition === 'GOOD' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                            }`}>
                                {inward.condition}
                            </span>
                        )}
                        {linked
                            ? <span className="text-[9px] font-bold text-indigo-600">Invoiced</span>
                            : <span className="text-[9px] font-bold text-slate-400">Not invoiced</span>}
                    </div>
                </div>
            </div>
        </div>
    );
}

function InvoiceNode({ invoice, onClick }) {
    return (
        <div
            data-flow-node={`invoice-${invoice.id}`}
            onClick={onClick}
            className="relative z-10 bg-white border-2 border-indigo-200 hover:border-indigo-400 rounded-2xl shadow-sm hover:shadow-md cursor-pointer transition-all px-4 py-3 w-full"
        >
            <div className="flex items-start gap-3">
                <div className="p-2 bg-indigo-50 rounded-lg shrink-0">
                    <Receipt size={16} className="text-indigo-600" />
                </div>
                <div className="flex-1 min-w-0">
                    <span className="text-[9px] font-bold uppercase tracking-widest text-indigo-600">Invoice</span>
                    <p className="text-sm font-black text-slate-800 truncate">{invoice.invoice_number}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs font-bold text-slate-700 tabular-nums">₹{fmtNum(invoice.amount)}</span>
                        <PaymentPill status={invoice.payment_status} />
                    </div>
                    <p className="text-[10px] text-slate-500 mt-1">
                        {fmtDate(invoice.invoice_date)} · {invoice.inward_count ?? (invoice.inwards || []).length} GRN
                    </p>
                </div>
            </div>
        </div>
    );
}

function InvoiceSlotNode({ invoice, inwardId, onClick }) {
    return (
        <div
            data-flow-node={`invoice-slot-${inwardId}`}
            onClick={onClick}
            className="relative z-10 bg-white border-2 border-emerald-300 hover:border-emerald-400 rounded-2xl shadow-sm hover:shadow-md cursor-pointer transition-all px-4 py-3 w-full"
        >
            <div className="flex items-start gap-3">
                <div className="p-2 bg-emerald-50 rounded-lg shrink-0">
                    <Receipt size={16} className="text-emerald-600" />
                </div>
                <div className="flex-1 min-w-0">
                    <span className="text-[9px] font-bold uppercase tracking-widest text-emerald-600">Invoice</span>
                    <p className="text-sm font-black text-slate-800 truncate">{invoice.invoice_number}</p>
                    <p className="text-xs font-bold text-emerald-700 tabular-nums mt-0.5">
                        ₹{fmtNum(invoice.amount)}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                        <PaymentPill status={invoice.payment_status} />
                        <span className="text-[10px] text-slate-400">{fmtDate(invoice.invoice_date)}</span>
                    </div>
                </div>
            </div>
        </div>
    );
}

function NoInvoiceNode({ inwardId, onClick }) {
    return (
        <div
            data-flow-node={`invoice-slot-${inwardId}`}
            onClick={onClick}
            className="relative z-10 bg-red-50 border-2 border-red-300 hover:border-red-400 rounded-2xl shadow-sm hover:shadow-md cursor-pointer transition-all px-4 py-3 w-full flex flex-col items-center justify-center text-center"
            style={{ minHeight: '80px' }}
        >
            <Receipt size={16} className="text-red-400 mb-1" />
            <p className="text-xs font-bold text-red-600">No Invoice</p>
            <p className="text-[10px] text-red-400 mt-0.5">Click to create</p>
        </div>
    );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function PurchaseFlowPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const containerRef = useRef(null);

    const [po,       setPo]       = useState(null);
    const [inwards,  setInwards]  = useState([]);
    const [invoices, setInvoices] = useState([]);
    const [loading,  setLoading]  = useState(true);
    const [err,      setErr]      = useState(null);
    const [tick,     setTick]     = useState(0);  // forces connector recompute

    const [openInward,  setOpenInward]  = useState(null);  // existing inward — display modal
    const [openInvoice, setOpenInvoice] = useState(null);  // existing invoice
    const [openPo,      setOpenPo]      = useState(false);
    const [creatingInward,  setCreatingInward]  = useState(false);
    // Inward create flow: snapshot + built payload travel between create and review
    // so the user can Back out of review without losing what they typed.
    const [inwardSnapshot,  setInwardSnapshot]  = useState(null);
    const [inwardPayload,   setInwardPayload]   = useState(null);
    const [inwardStep,      setInwardStep]      = useState('create');   // 'create' | 'review'
    const [creatingInvoiceForInwardId, setCreatingInvoiceForInwardId] = useState(null);
    const [statusBusy,   setStatusBusy]   = useState(false);
    const [confirmAction, setConfirmAction] = useState(null);   // 'PARTIAL_RECEIPT' | 'COMPLETED' | null
    const [statusErr,    setStatusErr]    = useState(null);

    const loadAll = useCallback(async () => {
        setLoading(true);
        setErr(null);
        try {
            const [poRes, inRes, invRes] = await Promise.all([
                purchaseDeptApi.getOrderById(id),
                purchaseDeptApi.getInwards(id),
                purchaseDeptApi.getInvoices(id),
            ]);
            setPo(poRes.data?.data ?? poRes.data);
            setInwards(inRes.data?.data ?? inRes.data ?? []);
            setInvoices(invRes.data?.data ?? invRes.data ?? []);
        } catch (e) {
            setErr(e?.response?.data?.error || e.message || 'Failed to load purchase flow');
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => { loadAll(); }, [loadAll]);

    // Recompute connectors on resize
    useEffect(() => {
        if (!containerRef.current) return;
        const ro = new ResizeObserver(() => setTick(t => t + 1));
        ro.observe(containerRef.current);
        return () => ro.disconnect();
    }, []);

    const handleSavedInward = () => {
        setOpenInward(null);
        setCreatingInward(false);
        loadAll();
    };

    const handleSavedInvoice = () => {
        setOpenInvoice(null);
        setCreatingInvoiceForInwardId(null);
        loadAll();
    };

    const applyStatus = async (newStatus) => {
        if (!po) return;
        setStatusBusy(true); setStatusErr(null);
        try {
            await purchaseDeptApi.updateOrderStatus(po.id, newStatus);
            setConfirmAction(null);
            await loadAll();
        } catch (e) {
            setStatusErr(e?.response?.data?.error || e.message || 'Could not update status.');
        } finally {
            setStatusBusy(false);
        }
    };

    // ── Per-item summary: ordered vs received vs invoiced ────────────────────
    const summary = useMemo(() => {
        if (!po) return null;

        // Index inwards-by-invoice so we can tell which inward rows are "invoiced".
        const invoicedInwardIds = new Set();
        invoices.forEach(inv => (inv.inwards || []).forEach(iw => invoicedInwardIds.add(iw.id)));

        // Aggregate inward.items into per-PO-item and per-requirement buckets.
        const receivedByPoItem = {};
        const receivedByReq    = {};
        const invoicedByPoItem = {};
        const invoicedByReq    = {};
        inwards.forEach(iw => {
            const isInvoiced = invoicedInwardIds.has(iw.id) || iw.invoice_id != null;
            (iw.items || []).forEach(it => {
                const qty = parseFloat(it.qty_received || 0);
                if (it.purchase_order_item_id != null) {
                    receivedByPoItem[it.purchase_order_item_id] = (receivedByPoItem[it.purchase_order_item_id] || 0) + qty;
                    if (isInvoiced) invoicedByPoItem[it.purchase_order_item_id] = (invoicedByPoItem[it.purchase_order_item_id] || 0) + qty;
                }
                if (it.purchase_requirement_id != null) {
                    receivedByReq[it.purchase_requirement_id] = (receivedByReq[it.purchase_requirement_id] || 0) + qty;
                    if (isInvoiced) invoicedByReq[it.purchase_requirement_id] = (invoicedByReq[it.purchase_requirement_id] || 0) + qty;
                }
            });
        });

        const lines = (po.items || []).map(i => {
            const ordered  = parseFloat(i.quantity || 0);
            const unit     = i.uom || (i.item_type === 'fabric' ? 'm' : 'pcs');
            const price    = parseFloat(i.unit_price || 0);
            // Sum received across both linking conventions; fall back to whichever populates the PO data.
            const fromPoItem  = receivedByPoItem[i.id] || 0;
            const fromReqs    = (i.requirements || []).reduce((s, r) => s + (receivedByReq[r.id] || 0), 0);
            const received    = fromPoItem || fromReqs;
            const invFromPo   = invoicedByPoItem[i.id] || 0;
            const invFromReqs = (i.requirements || []).reduce((s, r) => s + (invoicedByReq[r.id] || 0), 0);
            const invoiced    = invFromPo || invFromReqs;
            let state;
            if (received <= 0.001)            state = 'pending';
            else if (received + 0.001 < ordered) state = 'partial';
            else                              state = 'complete';
            const label = i.item_type === 'fabric'
                ? `${i.fabric_type_name || 'Fabric'}${i.fabric_color_name ? ` · ${i.fabric_color_name}` : ''}${i.fabric_color_number ? ` (${i.fabric_color_number})` : ''}`
                : `${i.trim_item_name || 'Trim'}${i.variant_color_name ? ` · ${i.variant_color_name}` : ''}${i.variant_color_number ? ` (${i.variant_color_number})` : ''}${i.variant_size ? ` · Sz ${i.variant_size}` : ''}`;
            return {
                id: i.id, item_type: i.item_type, label, unit, ordered, received, invoiced, price,
                state,
                lineTotal: i.total_price != null ? parseFloat(i.total_price) : ordered * price,
            };
        });

        const totals = lines.reduce((acc, l) => {
            acc.lineCount   += 1;
            acc.orderedQty  += l.ordered;
            acc.receivedQty += l.received;
            acc.invoicedQty += l.invoiced;
            acc.orderedAmt  += l.lineTotal;
            if (l.state === 'complete') acc.completeLines += 1;
            else if (l.state === 'partial') acc.partialLines += 1;
            else acc.pendingLines += 1;
            return acc;
        }, { lineCount: 0, orderedQty: 0, receivedQty: 0, invoicedQty: 0, orderedAmt: 0, completeLines: 0, partialLines: 0, pendingLines: 0 });

        const invoicedAmt = invoices.reduce((s, inv) => s + parseFloat(inv.amount || 0), 0);
        const paidAmt     = invoices
            .filter(inv => (inv.payment_status || '').toUpperCase() === 'PAID')
            .reduce((s, inv) => s + parseFloat(inv.amount || 0), 0);

        return { lines, totals, invoicedAmt, paidAmt };
    }, [po, inwards, invoices]);

    // Map each inward id → its invoice (one invoice can cover multiple inwards)
    const inwardInvoiceMap = useMemo(() => {
        const map = {};
        invoices.forEach(inv => {
            (inv.inwards || []).forEach(iw => { map[iw.id] = inv; });
        });
        return map;
    }, [invoices]);

    // Build connector list: PO→GRN (emerald), GRN→InvoiceSlot (indigo)
    const edgeDefs = [];
    if (po) {
        inwards.forEach(iw => {
            edgeDefs.push({ from: 'po',             to: `inward-${iw.id}`,       color: '#10b981' });
            edgeDefs.push({ from: `inward-${iw.id}`, to: `invoice-slot-${iw.id}`, color: '#6366f1' });
        });
    }

    const total = computePoTotal(po);

    return (
        <div className="min-h-screen bg-slate-50">
            <div className="px-4 sm:px-6 py-5">
                {/* Header */}
                <div className="flex items-start justify-between gap-3 mb-5">
                    <div className="flex items-start gap-3">
                        <button
                            onClick={() => navigate('..')}
                            className="p-2 hover:bg-slate-100 rounded-lg transition shrink-0 mt-0.5"
                            title="Back to orders"
                        >
                            <ArrowLeft size={16} className="text-slate-500" />
                        </button>
                        <div>
                            <h1 className="text-xl font-black text-slate-800">Purchase Flow</h1>
                            <p className="text-xs text-slate-500 mt-0.5">PO → Inward (GRN) → Invoice pipeline</p>
                        </div>
                    </div>
                    <button
                        onClick={loadAll}
                        disabled={loading}
                        className="flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-orange-600 border border-slate-200 hover:border-orange-300 px-3 py-1.5 rounded-lg transition disabled:opacity-50 bg-white shadow-sm"
                    >
                        <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
                        Refresh
                    </button>
                </div>

                {err && (
                    <div className="flex items-center gap-2 bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-sm text-red-600 mb-4">
                        <AlertTriangle size={15} /> {err}
                    </div>
                )}

                {loading && !po ? (
                    <div className="flex justify-center items-center py-32 text-slate-400 gap-2">
                        <Loader2 size={18} className="animate-spin" />
                        <span className="text-sm">Loading purchase flow…</span>
                    </div>
                ) : !po ? (
                    <div className="text-center py-32 text-slate-400">
                        <PackageCheck size={36} className="mx-auto mb-3 opacity-30" />
                        <p className="text-base">Purchase order not found.</p>
                    </div>
                ) : (
                    <div ref={containerRef} className="relative">
                        <FlowConnectors containerRef={containerRef} nodes={edgeDefs} refreshKey={tick} />

                        {/* ── Summary panel ───────────────────────────────────────── */}
                        {summary && (
                            <div className="mb-8 bg-white border-2 border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                                <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 bg-slate-50 border-b border-slate-100">
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Summary</span>
                                        <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${(PO_STATUS_CFG[po.status] || PO_STATUS_CFG.DRAFT).cls}`}>
                                            {(PO_STATUS_CFG[po.status] || PO_STATUS_CFG.DRAFT).label}
                                        </span>
                                        <span className="text-[10px] text-slate-400">
                                            {summary.totals.completeLines} complete · {summary.totals.partialLines} partial · {summary.totals.pendingLines} pending
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {po.status !== 'COMPLETED' && po.status !== 'CANCELLED' && (
                                            <button
                                                onClick={() => { setConfirmAction('PARTIAL_RECEIPT'); setStatusErr(null); }}
                                                disabled={statusBusy || po.status === 'PARTIAL_RECEIPT'}
                                                className="flex items-center gap-1.5 text-xs font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-3 py-1.5 rounded-lg shadow-sm transition disabled:opacity-40"
                                                title={po.status === 'PARTIAL_RECEIPT' ? 'Already partial' : 'Mark PO as partially received'}
                                            >
                                                <CheckCircle2 size={12} /> Partial
                                            </button>
                                        )}
                                        {po.status !== 'COMPLETED' && po.status !== 'CANCELLED' && (
                                            <button
                                                onClick={() => { setConfirmAction('COMPLETED'); setStatusErr(null); }}
                                                disabled={statusBusy}
                                                className="flex items-center gap-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 rounded-lg shadow-sm transition disabled:opacity-40"
                                                title="Close the PO regardless of remaining qty"
                                            >
                                                <Lock size={12} /> Force Complete
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {/* Confirm strip */}
                                {confirmAction && (
                                    <div className={`px-5 py-3 border-b ${confirmAction === 'COMPLETED' ? 'bg-emerald-50 border-emerald-100' : 'bg-amber-50 border-amber-100'}`}>
                                        <div className="flex items-center justify-between gap-3 flex-wrap">
                                            <p className={`text-xs font-bold ${confirmAction === 'COMPLETED' ? 'text-emerald-800' : 'text-amber-800'}`}>
                                                {confirmAction === 'COMPLETED'
                                                    ? 'Force-close this PO? Remaining qty will be marked closed and no further inwards can be created.'
                                                    : 'Mark this PO as partially received? You can still add more inwards later.'}
                                            </p>
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={() => setConfirmAction(null)}
                                                    disabled={statusBusy}
                                                    className="text-[11px] font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 px-3 py-1 rounded-md transition disabled:opacity-40"
                                                >
                                                    Cancel
                                                </button>
                                                <button
                                                    onClick={() => applyStatus(confirmAction)}
                                                    disabled={statusBusy}
                                                    className={`flex items-center gap-1 text-[11px] font-bold text-white px-3 py-1 rounded-md transition disabled:opacity-40 ${confirmAction === 'COMPLETED' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-amber-600 hover:bg-amber-700'}`}
                                                >
                                                    {statusBusy && <Loader2 size={11} className="animate-spin" />}
                                                    Confirm
                                                </button>
                                            </div>
                                        </div>
                                        {statusErr && (
                                            <p className="mt-2 text-[11px] text-red-600 flex items-center gap-1">
                                                <AlertTriangle size={11} /> {statusErr}
                                            </p>
                                        )}
                                    </div>
                                )}

                                {/* Top stats */}
                                <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-slate-100 border-b border-slate-100">
                                    <div className="px-4 py-3">
                                        <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Ordered</p>
                                        <p className="text-sm font-bold text-slate-800 tabular-nums">₹{fmtNum(summary.totals.orderedAmt)}</p>
                                        <p className="text-[10px] text-slate-500">{summary.totals.lineCount} line{summary.totals.lineCount === 1 ? '' : 's'}</p>
                                    </div>
                                    <div className="px-4 py-3">
                                        <p className="text-[9px] font-bold uppercase tracking-wider text-emerald-600">Inwarded</p>
                                        <p className="text-sm font-bold text-slate-800 tabular-nums">{inwards.length} GRN</p>
                                        <p className="text-[10px] text-slate-500">{fmtNum(summary.totals.receivedQty)} units received</p>
                                    </div>
                                    <div className="px-4 py-3">
                                        <p className="text-[9px] font-bold uppercase tracking-wider text-indigo-600">Invoiced</p>
                                        <p className="text-sm font-bold text-slate-800 tabular-nums">₹{fmtNum(summary.invoicedAmt)}</p>
                                        <p className="text-[10px] text-slate-500">{invoices.length} invoice{invoices.length === 1 ? '' : 's'}</p>
                                    </div>
                                    <div className="px-4 py-3">
                                        <p className="text-[9px] font-bold uppercase tracking-wider text-emerald-700">Paid</p>
                                        <p className="text-sm font-bold text-slate-800 tabular-nums">₹{fmtNum(summary.paidAmt)}</p>
                                        <p className="text-[10px] text-slate-500">{summary.invoicedAmt > 0 ? `${Math.round((summary.paidAmt / summary.invoicedAmt) * 100)}% of invoiced` : 'no invoices yet'}</p>
                                    </div>
                                </div>

                                {/* Per-line comparison table */}
                                <div className="overflow-x-auto">
                                    <table className="w-full text-xs">
                                        <thead>
                                            <tr className="bg-slate-50 text-slate-500">
                                                <th className="text-left px-4 py-2 text-[9px] font-bold uppercase tracking-wider">Line</th>
                                                <th className="text-right px-4 py-2 text-[9px] font-bold uppercase tracking-wider">Ordered</th>
                                                <th className="text-right px-4 py-2 text-[9px] font-bold uppercase tracking-wider">Received</th>
                                                <th className="text-right px-4 py-2 text-[9px] font-bold uppercase tracking-wider">Invoiced</th>
                                                <th className="text-right px-4 py-2 text-[9px] font-bold uppercase tracking-wider">Δ</th>
                                                <th className="text-right px-4 py-2 text-[9px] font-bold uppercase tracking-wider">Status</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {summary.lines.length === 0 ? (
                                                <tr><td colSpan={6} className="text-center text-slate-400 italic py-6">No line items on this PO.</td></tr>
                                            ) : summary.lines.map(l => {
                                                const Icon = TYPE_ICON[l.item_type] || Tag;
                                                const delta = l.ordered - l.received;
                                                const stateCfg = l.state === 'complete'
                                                    ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                                                    : l.state === 'partial'
                                                        ? 'bg-amber-100 text-amber-700 border-amber-200'
                                                        : 'bg-slate-100 text-slate-600 border-slate-200';
                                                return (
                                                    <tr key={l.id} className="hover:bg-slate-50">
                                                        <td className="px-4 py-2">
                                                            <div className="flex items-center gap-2">
                                                                <Icon size={12} className="text-slate-400 shrink-0" />
                                                                <span className="font-bold text-slate-800 truncate">{l.label}</span>
                                                            </div>
                                                        </td>
                                                        <td className="px-4 py-2 text-right tabular-nums text-slate-700">{fmtNum(l.ordered)} {l.unit}</td>
                                                        <td className="px-4 py-2 text-right tabular-nums">
                                                            <span className={l.received > 0 ? 'font-bold text-emerald-700' : 'text-slate-400'}>{fmtNum(l.received)} {l.unit}</span>
                                                        </td>
                                                        <td className="px-4 py-2 text-right tabular-nums">
                                                            <span className={l.invoiced > 0 ? 'font-bold text-indigo-700' : 'text-slate-400'}>{fmtNum(l.invoiced)} {l.unit}</span>
                                                        </td>
                                                        <td className="px-4 py-2 text-right tabular-nums">
                                                            <span className={delta > 0.001 ? 'text-red-600 font-bold' : 'text-emerald-600 font-bold'}>
                                                                {delta > 0.001 ? `−${fmtNum(delta)}` : `+${fmtNum(-delta)}`}
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-2 text-right">
                                                            <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${stateCfg}`}>
                                                                {l.state}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {/* PO row */}
                        <div className="grid grid-cols-1 mb-12">
                            <PoNode po={po} total={total} onClick={() => setOpenPo(true)} />
                        </div>

                        {/* GRN + Invoice paired rows */}
                        <div className="mb-3 flex items-center justify-between">
                            <div className="flex items-center gap-6">
                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-600">Inwards</span>
                                    <span className="text-xs text-slate-400 tabular-nums">{inwards.length}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-bold uppercase tracking-widest text-indigo-500">Invoices</span>
                                    <span className="text-xs text-slate-400 tabular-nums">{invoices.length}</span>
                                </div>
                            </div>
                            <button
                                onClick={() => setCreatingInward(true)}
                                className="flex items-center gap-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 rounded-lg shadow-sm transition"
                            >
                                <Plus size={12} /> Add Inward
                            </button>
                        </div>
                        {inwards.length === 0 ? (
                            <div className="bg-white border-2 border-dashed border-slate-200 rounded-2xl px-4 py-8 text-center text-sm text-slate-400">
                                No inwards yet. Click "Add Inward" to record the first GRN.
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {inwards.map(iw => {
                                    const invoice = inwardInvoiceMap[iw.id];
                                    return (
                                        <div key={iw.id} className="grid grid-cols-2 gap-6 items-start">
                                            <InwardNode inward={iw} onClick={() => setOpenInward(iw)} />
                                            {invoice
                                                ? <InvoiceSlotNode invoice={invoice} inwardId={iw.id} onClick={() => setOpenInvoice(invoice)} />
                                                : <NoInvoiceNode inwardId={iw.id} onClick={() => setCreatingInvoiceForInwardId(iw.id)} />
                                            }
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {/* Line items reference */}
                        {po.items && po.items.length > 0 && (
                            <div className="mt-12 bg-white border border-slate-200 rounded-2xl px-5 py-4">
                                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3">PO Line Items</p>
                                <div className="space-y-1.5">
                                    {po.items.map(i => {
                                        const Icon = TYPE_ICON[i.item_type] || Tag;
                                        const qty   = parseFloat(i.quantity ?? 0);
                                        const unit  = i.uom || (i.item_type === 'fabric' ? 'm' : 'pcs');
                                        const price = parseFloat(i.unit_price ?? 0);
                                        const total = i.total_price != null ? parseFloat(i.total_price) : (qty * price);
                                        const label = i.item_type === 'fabric'
                                            ? `${i.fabric_type_name || 'Fabric'}${i.fabric_color_name ? ` · ${i.fabric_color_name}` : ''}${i.fabric_color_number ? ` (${i.fabric_color_number})` : ''}`
                                            : `${i.trim_item_name || 'Trim'}${i.variant_color_name ? ` · ${i.variant_color_name}` : ''}${i.variant_color_number ? ` (${i.variant_color_number})` : ''}${i.variant_size ? ` · Sz ${i.variant_size}` : ''}`;
                                        return (
                                            <div key={i.id} className="flex items-center gap-3 bg-slate-50 rounded-xl p-2.5">
                                                <Icon size={13} className="text-slate-500 shrink-0" />
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                        <p className="text-xs font-bold text-slate-800 truncate">{label}</p>
                                                        {i.substitute_count > 0 && (
                                                            <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
                                                                🔄 {i.substitute_count} sub{i.substitute_count === 1 ? '' : 's'}
                                                            </span>
                                                        )}
                                                    </div>
                                                    {i.item_type === 'trim' && i.trim_item_variant_id && (
                                                        <SupplierCodePill supplierId={po.supplier_id} supplierName={po.supplier_name} variantId={i.trim_item_variant_id} className="mt-0.5" />
                                                    )}
                                                    <p className="text-[10px] text-slate-500">
                                                        {i.fabric_color_number ? `${i.fabric_color_number} · ` : ''}
                                                        {i.variant_color_number ? `${i.variant_color_number} · ` : ''}
                                                        {i.trim_item_code ? `${i.trim_item_code} · ` : ''}
                                                        {(i.requirement_count ?? (i.requirements || []).length)} req{(i.requirement_count ?? (i.requirements || []).length) === 1 ? '' : 's'}
                                                    </p>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-xs font-bold text-slate-700 tabular-nums">
                                                        {qty.toLocaleString()} {unit}
                                                    </p>
                                                    <p className="text-[10px] text-slate-400 tabular-nums">
                                                        @ {price.toFixed(2)} = ₹{total.toFixed(2)}
                                                    </p>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Modals */}
            {openInward && (
                <InwardDisplayModal
                    inward={openInward}
                    poItems={po?.items || []}
                    supplierId={po?.supplier_id}
                    supplierName={po?.supplier_name}
                    poCode={po?.po_code}
                    poId={po?.id}
                    onClose={() => setOpenInward(null)}
                    onDeleted={() => { setOpenInward(null); handleSavedInward?.(); }}
                />
            )}
            {creatingInward && po && inwardStep === 'create' && (
                <InwardCreateModal
                    poId={po.id}
                    poCode={po.po_code}
                    poItems={po.items || []}
                    supplierId={po.supplier_id}
                    supplierName={po.supplier_name}
                    allInwards={inwards}
                    initialSnapshot={inwardSnapshot}
                    onClose={() => { setCreatingInward(false); setInwardSnapshot(null); setInwardPayload(null); setInwardStep('create'); }}
                    onReview={({ payload, snapshot }) => {
                        setInwardPayload(payload);
                        setInwardSnapshot(snapshot);
                        setInwardStep('review');
                    }}
                />
            )}
            {creatingInward && po && inwardStep === 'review' && inwardPayload && (
                <InwardReviewModal
                    poId={po.id}
                    poCode={po.po_code}
                    payload={inwardPayload}
                    poItems={po.items || []}
                    supplierId={po.supplier_id}
                    supplierName={po.supplier_name}
                    onClose={() => { setCreatingInward(false); setInwardSnapshot(null); setInwardPayload(null); setInwardStep('create'); }}
                    onBack={() => setInwardStep('create')}
                    onConfirmed={(saved) => {
                        setCreatingInward(false);
                        setInwardSnapshot(null);
                        setInwardPayload(null);
                        setInwardStep('create');
                        handleSavedInward?.(saved);
                    }}
                />
            )}
            {openInvoice && (
                <InvoiceModal
                    inwards={inwards}
                    poItems={po?.items || []}
                    invoice={openInvoice}
                    initialMode="view"
                    onClose={() => setOpenInvoice(null)}
                    onSaved={handleSavedInvoice}
                    onDeleted={handleSavedInvoice}
                />
            )}
            {creatingInvoiceForInwardId != null && (
                <InvoiceModal
                    inwards={inwards}
                    poItems={po?.items || []}
                    invoice={null}
                    initialMode="create"
                    defaultSelectedIds={new Set([creatingInvoiceForInwardId])}
                    onClose={() => setCreatingInvoiceForInwardId(null)}
                    onSaved={handleSavedInvoice}
                    onDeleted={handleSavedInvoice}
                />
            )}
            {openPo && po && (
                <PoDetailModal
                    po={po}
                    onClose={() => setOpenPo(false)}
                    onUpdated={() => { setOpenPo(false); loadAll(); }}
                />
            )}
        </div>
    );
}

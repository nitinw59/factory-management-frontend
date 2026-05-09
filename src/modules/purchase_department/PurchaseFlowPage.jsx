import { useState, useEffect, useCallback, useLayoutEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    Loader2, ArrowLeft, RefreshCw, AlertTriangle, Plus, PackageCheck, FileText, Receipt,
    Package, Scissors, Tag, Calendar, Building2, ShoppingCart,
} from 'lucide-react';
import { purchaseDeptApi } from '../../api/purchaseDeptApi';
import InwardModal from './InwardModal';
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

    const [openInward,  setOpenInward]  = useState(null);  // existing inward
    const [openInvoice, setOpenInvoice] = useState(null);  // existing invoice
    const [openPo,      setOpenPo]      = useState(false);
    const [creatingInward,  setCreatingInward]  = useState(false);
    const [creatingInvoice, setCreatingInvoice] = useState(false);

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
        setCreatingInvoice(false);
        loadAll();
    };

    // Build connector list
    const edgeDefs = [];
    if (po) {
        inwards.forEach(iw => {
            edgeDefs.push({ from: 'po', to: `inward-${iw.id}`, color: '#10b981' });
        });
        invoices.forEach(inv => {
            (inv.inwards || []).forEach(iw => {
                edgeDefs.push({ from: `inward-${iw.id}`, to: `invoice-${inv.id}`, color: '#6366f1' });
            });
        });
    }

    const total = computePoTotal(po);

    return (
        <div className="min-h-screen bg-slate-50">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 py-5">
                {/* Header */}
                <div className="flex items-start justify-between gap-3 mb-5">
                    <div className="flex items-start gap-3">
                        <button
                            onClick={() => navigate('/purchase-department/orders')}
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

                        {/* PO row */}
                        <div className="grid grid-cols-1 mb-12">
                            <PoNode po={po} total={total} onClick={() => setOpenPo(true)} />
                        </div>

                        {/* Inward row + Add button */}
                        <div className="mb-3 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-600">Inwards</span>
                                <span className="text-xs text-slate-400 tabular-nums">{inwards.length}</span>
                            </div>
                            <button
                                onClick={() => setCreatingInward(true)}
                                className="flex items-center gap-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 rounded-lg shadow-sm transition"
                            >
                                <Plus size={12} /> Add Inward
                            </button>
                        </div>
                        {inwards.length === 0 ? (
                            <div className="bg-white border-2 border-dashed border-slate-200 rounded-2xl px-4 py-8 text-center text-sm text-slate-400 mb-12">
                                No inwards yet. Click "Add Inward" to record the first GRN.
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-12">
                                {inwards.map(iw => (
                                    <InwardNode
                                        key={iw.id}
                                        inward={iw}
                                        onClick={() => setOpenInward(iw)}
                                    />
                                ))}
                            </div>
                        )}

                        {/* Invoice row + Add button */}
                        <div className="mb-3 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] font-bold uppercase tracking-widest text-indigo-600">Invoices</span>
                                <span className="text-xs text-slate-400 tabular-nums">{invoices.length}</span>
                            </div>
                            <button
                                onClick={() => setCreatingInvoice(true)}
                                disabled={inwards.filter(i => i.invoice_id == null).length === 0}
                                className="flex items-center gap-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 px-3 py-1.5 rounded-lg shadow-sm transition"
                                title={inwards.filter(i => i.invoice_id == null).length === 0 ? 'No unlinked inwards' : 'Add invoice'}
                            >
                                <Plus size={12} /> Add Invoice
                            </button>
                        </div>
                        {invoices.length === 0 ? (
                            <div className="bg-white border-2 border-dashed border-slate-200 rounded-2xl px-4 py-8 text-center text-sm text-slate-400">
                                No invoices yet. Add inwards first, then create an invoice and link one or more inwards to it.
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                {invoices.map(inv => (
                                    <InvoiceNode
                                        key={inv.id}
                                        invoice={inv}
                                        onClick={() => setOpenInvoice(inv)}
                                    />
                                ))}
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
                                            ? `${i.fabric_type_name || 'Fabric'}${i.fabric_color_name ? ` · ${i.fabric_color_name}` : ''}`
                                            : `${i.trim_item_name || 'Trim'}${i.variant_color_name ? ` · ${i.variant_color_name}` : ''}`;
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
                <InwardModal
                    poId={po.id}
                    poItems={po.items || []}
                    allInwards={inwards}
                    inward={openInward}
                    initialMode="view"
                    onClose={() => setOpenInward(null)}
                    onSaved={handleSavedInward}
                    onDeleted={handleSavedInward}
                />
            )}
            {creatingInward && po && (
                <InwardModal
                    poId={po.id}
                    poItems={po.items || []}
                    allInwards={inwards}
                    inward={null}
                    initialMode="create"
                    onClose={() => setCreatingInward(false)}
                    onSaved={handleSavedInward}
                />
            )}
            {openInvoice && (
                <InvoiceModal
                    inwards={inwards}
                    invoice={openInvoice}
                    initialMode="view"
                    onClose={() => setOpenInvoice(null)}
                    onSaved={handleSavedInvoice}
                    onDeleted={handleSavedInvoice}
                />
            )}
            {creatingInvoice && (
                <InvoiceModal
                    inwards={inwards}
                    invoice={null}
                    initialMode="create"
                    onClose={() => setCreatingInvoice(false)}
                    onSaved={handleSavedInvoice}
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

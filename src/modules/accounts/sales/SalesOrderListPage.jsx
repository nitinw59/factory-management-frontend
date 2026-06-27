import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { storeManagerApi } from '../../../api/storeManagerApi';
import { accountingApi } from '../../../api/accountingApi';
import {
    Search, Loader2, X, Paperclip, Package, Plus,
    Layers, Edit3, FileText, Truck, ExternalLink,
    Pencil, AlertCircle, ChevronDown
} from 'lucide-react';
import Modal from '../../../shared/Modal';
import FabricIntakeForm from '../purchase/FabricIntakeForm';
import EditFabricRollModal from '../purchase/EditFabricRollModal';

// ─── Utilities ───────────────────────────────────────────────────────────────

const fmt = (d) =>
    d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

const formatFileSize = (bytes) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const STATUS_STYLE = {
    PENDING:     'bg-amber-50 text-amber-700 border-amber-200',
    ACTIVE:      'bg-blue-50 text-blue-700 border-blue-200',
    IN_PROGRESS: 'bg-violet-50 text-violet-700 border-violet-200',
    COMPLETED:   'bg-emerald-50 text-emerald-700 border-emerald-200',
    CANCELLED:   'bg-red-50 text-red-700 border-red-200',
};

const StatusBadge = ({ status }) => (
    <span className={`inline-block px-2.5 py-0.5 text-[11px] font-bold rounded-full border tracking-wide ${STATUS_STYLE[status] || 'bg-slate-100 text-slate-600 border-slate-200'}`}>
        {status?.replace(/_/g, ' ') || '—'}
    </span>
);

// ─── ReceivedRollsList (unchanged, kept working) ─────────────────────────────

const ReceivedRollsList = ({ purchaseOrderId }) => {
    const [rolls, setRolls]           = useState([]);
    const [loading, setLoading]       = useState(true);
    const [error, setError]           = useState(null);
    const [meterFilter, setMeterFilter] = useState('');
    const [editingRoll, setEditingRoll] = useState(null);
    const [editingIntake, setEditingIntake] = useState(null);

    const fetchRolls = async () => {
        setLoading(true);
        try {
            const res = await storeManagerApi.getFabricRollsByPO(purchaseOrderId);
            setRolls(res.data);
        } catch { setError('Failed to load rolls'); }
        finally { setLoading(false); }
    };

    useEffect(() => { if (purchaseOrderId) fetchRolls(); }, [purchaseOrderId]);

    const handleUpdateRoll = async (data) => {
        await storeManagerApi.updateFabricRoll(data.id, {
            meter: data.meter, uom: data.uom, fabric_color_id: data.fabric_color_id,
        });
        setEditingRoll(null); fetchRolls();
    };

    const handleDeleteRoll = async (id) => {
        await storeManagerApi.deleteFabricRoll(id);
        setEditingRoll(null); fetchRolls();
    };

    const filtered = rolls.filter(r => !meterFilter || String(r.meter).includes(meterFilter));
    const intakeGroups = Object.values(filtered.reduce((acc, roll) => {
        const k = roll.intake_id ?? 'unknown';
        if (!acc[k]) acc[k] = { intake_id: roll.intake_id, intake_date: roll.intake_date || roll.bill_date, reference_number: roll.reference_number, rolls: [] };
        acc[k].rolls.push(roll);
        return acc;
    }, {}));

    if (loading) return <div className="text-xs text-slate-500 py-3 flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin"/> Loading rolls…</div>;
    if (error)   return <div className="text-xs text-red-500 py-2">{error}</div>;
    if (!rolls.length) return <div className="text-xs text-slate-400 italic py-2">No rolls received yet.</div>;

    return (
        <div className="mt-2 bg-white rounded-lg border border-slate-200">
            <div className="flex justify-between items-center px-3 py-2 border-b border-slate-100">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                    <Layers size={11}/> Received ({filtered.length}/{rolls.length})
                </span>
                <div className="relative">
                    <Search className="absolute left-2 top-1.5 text-slate-400 w-3 h-3"/>
                    <input
                        type="number"
                        placeholder="Filter meters…"
                        value={meterFilter}
                        onChange={e => setMeterFilter(e.target.value)}
                        className="pl-6 pr-2 py-1 text-xs border border-slate-200 rounded w-28 focus:outline-none focus:border-blue-400"
                    />
                </div>
            </div>
            <div className="max-h-52 overflow-y-auto divide-y divide-slate-100">
                {intakeGroups.map(group => (
                    <div key={group.intake_id ?? 'unknown'}>
                        <div className="flex items-center justify-between bg-indigo-50/60 px-3 py-1.5 text-[11px] text-indigo-700">
                            <div className="flex items-center gap-2">
                                <span className="font-bold">Intake #{group.intake_id ?? '—'}</span>
                                {group.intake_date && <span className="text-indigo-400">{fmt(group.intake_date)}</span>}
                                {group.reference_number && <span className="text-indigo-500">· {group.reference_number}</span>}
                                <span className="text-indigo-300">({group.rolls.length} roll{group.rolls.length !== 1 ? 's' : ''})</span>
                            </div>
                            {group.intake_id != null && (
                                <button onClick={() => setEditingIntake({ id: group.intake_id })} className="flex items-center gap-0.5 text-[10px] font-bold text-indigo-600 hover:text-indigo-800 px-1 py-0.5 rounded hover:bg-indigo-100">
                                    <Pencil size={10}/> Edit
                                </button>
                            )}
                        </div>
                        <table className="w-full text-xs">
                            <tbody className="divide-y divide-slate-50">
                                {group.rolls.map(roll => (
                                    <tr key={roll.id} className="hover:bg-slate-50">
                                        <td className="py-1.5 pl-3 font-mono text-indigo-500 w-14">R-{roll.id}</td>
                                        <td className="py-1.5 text-slate-600">{roll.fabric_type} · {roll.fabric_color}</td>
                                        <td className="py-1.5 text-right font-bold text-slate-800 w-14">{roll.meter}</td>
                                        <td className="py-1.5 text-center text-slate-400 w-10">{roll.uom || 'm'}</td>
                                        <td className="py-1.5 text-center w-14">
                                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${roll.status === 'IN_STOCK' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>
                                                {roll.status === 'IN_STOCK' ? 'Stock' : 'Prod'}
                                            </span>
                                        </td>
                                        <td className="py-1.5 pr-3 text-center w-8">
                                            <button onClick={() => setEditingRoll(roll)} disabled={roll.status === 'COMPLETED'} className="text-slate-300 hover:text-blue-500 disabled:cursor-not-allowed transition-colors">
                                                <Edit3 size={12}/>
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ))}
            </div>
            {editingRoll && (
                <EditFabricRollModal roll={editingRoll} onSave={handleUpdateRoll} onDelete={handleDeleteRoll} onClose={() => setEditingRoll(null)}/>
            )}
            {editingIntake && (
                <Modal title={`Edit Intake #${editingIntake.id}`} onClose={() => setEditingIntake(null)}>
                    <FabricIntakeForm intake={editingIntake} onSave={() => { setEditingIntake(null); fetchRolls(); }} onClose={() => setEditingIntake(null)}/>
                </Modal>
            )}
        </div>
    );
};

// ─── Sales Order Detail Modal ────────────────────────────────────────────────

const SalesOrderDetailModal = ({ so, onClose }) => {
    const soId = so.id ?? so.sales_order_id;

    const [details, setDetails]         = useState(null);
    const [sizeMap, setSizeMap]         = useState({});
    const [loading, setLoading]         = useState(true);
    const [error, setError]             = useState(null);
    const [expandedPOs, setExpandedPOs] = useState({});
    const [intakeModalOpen, setIntakeModalOpen] = useState(false);
    const [selectedPO, setSelectedPO]   = useState(null);

    useEffect(() => {
        Promise.all([
            accountingApi.getSalesOrderDetails(soId),
            accountingApi.getSizes(),
        ])
            .then(([detailsRes, sizesRes]) => {
                setDetails(detailsRes.data);
                const sizes = sizesRes.data?.data ?? sizesRes.data ?? [];
                setSizeMap(Object.fromEntries(sizes.map(s => [String(s.id), s.name])));
            })
            .catch(() => setError('Failed to load order details.'))
            .finally(() => setLoading(false));
    }, [soId]);

    const togglePO = (id) => setExpandedPOs(prev => ({ ...prev, [id]: !prev[id] }));

    // Merge: use fetched details for products+attachments, list data for purchase_orders
    const purchaseOrders = so.purchase_orders || [];

    return createPortal(
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>

                {/* ── Modal header ── */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0 bg-white">
                    <div className="flex items-center gap-3">
                        <FileText className="w-5 h-5 text-indigo-500 shrink-0"/>
                        <h2 className="text-lg font-bold text-slate-900 tracking-tight">{so.order_number}</h2>
                        <StatusBadge status={so.status}/>
                    </div>
                    <div className="flex items-center gap-2">
                        <Link
                            to={`/accounts/sales/${soId}/edit`}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-bold text-indigo-600 hover:bg-indigo-50 border border-indigo-100 rounded-lg transition-colors"
                        >
                            <Pencil size={13}/> Edit
                        </Link>
                        <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-full transition-colors">
                            <X size={18} className="text-slate-500"/>
                        </button>
                    </div>
                </div>

                {/* ── Scrollable body ── */}
                <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

                    {loading && (
                        <div className="flex justify-center py-16">
                            <Loader2 className="w-7 h-7 animate-spin text-indigo-400"/>
                        </div>
                    )}

                    {error && (
                        <div className="flex items-center gap-2 bg-red-50 text-red-700 px-4 py-3 rounded-xl border border-red-200">
                            <AlertCircle size={15} className="shrink-0"/> <span className="text-sm">{error}</span>
                        </div>
                    )}

                    {details && (
                        <>
                            {/* ── Order header info ── */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                {[
                                    { label: 'Customer',    value: details.customer_name  || so.customer_name },
                                    { label: 'Buyer PO',    value: details.buyer_po_number || so.buyer_po_number || '—' },
                                    { label: 'Order Date',  value: fmt(details.order_date  || so.order_date) },
                                    { label: 'Delivery',    value: fmt(details.delivery_date || so.delivery_date) },
                                ].map(({ label, value }) => (
                                    <div key={label} className="bg-slate-50 border border-slate-100 rounded-xl px-4 py-3">
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{label}</p>
                                        <p className="text-sm font-semibold text-slate-800 mt-1 truncate">{value}</p>
                                    </div>
                                ))}
                            </div>

                            {details.notes && (
                                <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
                                    <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wider mb-1">Notes</p>
                                    <p className="text-sm text-slate-700 whitespace-pre-wrap">{details.notes}</p>
                                </div>
                            )}

                            {/* ── Products with per-color size breakdown ── */}
                            <div>
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
                                    Product Lines · {details.products?.length ?? 0}
                                </p>
                                <div className="space-y-3">
                                    {(details.products || []).map((prod, pIdx) => {
                                        const colors = prod.colors || [];
                                        const prodTotal = colors.reduce((sum, c) => {
                                            const fromSizes = (c.sizes || []).reduce((s, sz) => s + (Number(sz.quantity) || 0), 0);
                                            return sum + (fromSizes || Number(c.quantity) || 0);
                                        }, 0);

                                        return (
                                            <div key={pIdx} className="border border-slate-200 rounded-xl overflow-hidden">
                                                {/* Product row header */}
                                                <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-100">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-bold text-slate-800">{prod.product_name}</span>
                                                        <span className="text-slate-300">·</span>
                                                        <span className="text-sm text-slate-500">{prod.fabric_type}</span>
                                                    </div>
                                                    <span className="text-sm font-bold text-slate-600 tabular-nums">
                                                        {prodTotal.toLocaleString()} pcs
                                                    </span>
                                                </div>

                                                {/* Colors */}
                                                {colors.length === 0 ? (
                                                    <p className="px-4 py-3 text-sm text-slate-400 italic">No colors defined</p>
                                                ) : (
                                                    <div className="divide-y divide-slate-100">
                                                        {colors.map((color, cIdx) => {
                                                            const sizes   = color.sizes || [];
                                                            const cTotal  = sizes.length > 0
                                                                ? sizes.reduce((s, sz) => s + (Number(sz.quantity) || 0), 0)
                                                                : Number(color.quantity) || 0;
                                                            const price   = parseFloat(color.unit_price) || 0;
                                                            const lineVal = cTotal * price;

                                                            return (
                                                                <div key={cIdx} className="px-4 py-3 flex flex-wrap items-center gap-4">
                                                                    {/* Color label */}
                                                                    <div className="w-28 shrink-0">
                                                                        <p className="text-sm font-semibold text-slate-700">{color.color_name}</p>
                                                                        <p className="text-[11px] text-slate-400 font-mono">{color.color_number}</p>
                                                                    </div>

                                                                    {/* Size chips */}
                                                                    <div className="flex flex-wrap gap-1.5 flex-1">
                                                                        {sizes.length > 0 ? sizes.map(sz => (
                                                                            <div key={sz.size_id} className="flex flex-col items-center bg-indigo-50 border border-indigo-100 rounded-lg px-2.5 py-1 min-w-[2.75rem]">
                                                                                <span className="text-[9px] font-bold text-indigo-400 uppercase leading-none">{sizeMap[String(sz.size_id)] || sz.size_name || `#${sz.size_id}`}</span>
                                                                                <span className="text-sm font-bold text-indigo-800 leading-tight mt-0.5">{sz.quantity}</span>
                                                                            </div>
                                                                        )) : (
                                                                            <span className="text-xs text-slate-400 italic self-center">No size breakdown</span>
                                                                        )}
                                                                    </div>

                                                                    {/* Totals */}
                                                                    <div className="text-right shrink-0 ml-auto min-w-[6rem]">
                                                                        <p className="text-sm font-bold text-slate-800 tabular-nums">{cTotal.toLocaleString()} pcs</p>
                                                                        {price > 0 && (
                                                                            <p className="text-[11px] text-slate-400 tabular-nums">₹{price}/pc · ₹{lineVal.toLocaleString('en-IN', { minimumFractionDigits: 0 })}</p>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* ── Attachments ── */}
                            <div>
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                                    <Paperclip size={12}/> Documents & Attachments
                                </p>
                                {(details.attachments || []).length > 0 ? (
                                    <div className="space-y-2">
                                        {details.attachments.map(att => (
                                            <a
                                                key={att.id}
                                                href={att.file_url || att.url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="flex items-center gap-3 px-4 py-3 bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-200 rounded-xl transition-colors group"
                                            >
                                                <FileText className="w-4 h-4 text-slate-400 group-hover:text-blue-500 shrink-0"/>
                                                <span className="text-sm text-slate-700 group-hover:text-blue-700 flex-1 truncate">
                                                    {att.original_filename || att.filename || att.name || 'File'}
                                                </span>
                                                {att.file_size != null && (
                                                    <span className="text-[11px] text-slate-400 shrink-0">{formatFileSize(att.file_size)}</span>
                                                )}
                                                <ExternalLink size={13} className="text-slate-300 group-hover:text-blue-400 shrink-0"/>
                                            </a>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="px-4 py-4 bg-slate-50 border border-dashed border-slate-200 rounded-xl text-sm text-slate-400 text-center">
                                        No documents attached
                                    </div>
                                )}
                            </div>
                        </>
                    )}

                    {/* ── Purchase Orders (always from list data) ── */}
                    <div>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                            <Truck size={12}/> Linked Purchase Orders
                        </p>
                        {purchaseOrders.length > 0 ? (
                            <div className="space-y-2">
                                {purchaseOrders.map(po => (
                                    <div key={po.id} className="border border-slate-200 rounded-xl overflow-hidden">
                                        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                                            <div>
                                                <p className="text-sm font-bold text-slate-700">{po.po_code || po.po_number}</p>
                                                <p className="text-[11px] text-slate-500 mt-0.5">{po.supplier_name}</p>
                                                {po.material_summary && (
                                                    <p className="text-[11px] text-slate-400 mt-0.5 max-w-sm truncate">{po.material_summary}</p>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <StatusBadge status={po.status}/>
                                                <button
                                                    onClick={() => togglePO(po.id)}
                                                    className={`flex items-center gap-1 text-xs font-bold px-2.5 py-1.5 rounded-lg border transition-colors ${expandedPOs[po.id] ? 'bg-slate-100 border-slate-300 text-slate-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                                                >
                                                    <Layers size={13}/> Rolls
                                                    <ChevronDown size={12} className={`transition-transform ${expandedPOs[po.id] ? 'rotate-180' : ''}`}/>
                                                </button>
                                                <button
                                                    onClick={() => { setSelectedPO(po); setIntakeModalOpen(true); }}
                                                    className="flex items-center gap-1 text-xs font-bold px-2.5 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors shadow-sm"
                                                >
                                                    <Package size={13}/> Receive Fabric
                                                </button>
                                            </div>
                                        </div>
                                        {expandedPOs[po.id] && (
                                            <div className="px-4 pb-3 border-t border-slate-100 bg-slate-50/50">
                                                <ReceivedRollsList purchaseOrderId={po.id}/>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="px-4 py-4 bg-slate-50 border border-dashed border-slate-200 rounded-xl text-sm text-slate-400 text-center">
                                No purchase orders linked to this sales order
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {intakeModalOpen && selectedPO && (
                <Modal title={`Receive Fabric — ${selectedPO.po_code || selectedPO.po_number}`} onClose={() => setIntakeModalOpen(false)}>
                    <FabricIntakeForm
                        onSave={async (data) => {
                            await storeManagerApi.createFabricIntake(data);
                            setIntakeModalOpen(false);
                        }}
                        onClose={() => setIntakeModalOpen(false)}
                        purchaseOrder={selectedPO}
                    />
                </Modal>
            )}
        </div>,
        document.body
    );
};

// ─── Main Page ────────────────────────────────────────────────────────────────

const STATUS_FILTERS = ['All', 'ACTIVE', 'PENDING', 'COMPLETED', 'CANCELLED'];

const SalesOrderListPage = () => {
    const [orders, setOrders]         = useState([]);
    const [loading, setLoading]       = useState(true);
    const [search, setSearch]         = useState('');
    const [statusFilter, setStatus]   = useState('All');
    const [selectedSO, setSelectedSO] = useState(null);

    useEffect(() => {
        accountingApi.getAllSalesOrders()
            .then(res => {
                const sorted = (res.data || []).sort((a, b) => new Date(b.order_date) - new Date(a.order_date));
                setOrders(sorted);
            })
            .catch(err => console.error('Failed to load sales orders', err))
            .finally(() => setLoading(false));
    }, []);

    const filtered = orders.filter(so => {
        if (statusFilter !== 'All' && so.status !== statusFilter) return false;
        if (!search) return true;
        const q = search.toLowerCase();
        return (
            so.order_number?.toLowerCase().includes(q) ||
            so.customer_name?.toLowerCase().includes(q) ||
            so.buyer_po_number?.toLowerCase().includes(q)
        );
    });

    // Stats from list data
    const totalOrders  = orders.length;
    const activeOrders = orders.filter(o => o.status === 'ACTIVE' || o.status === 'PENDING').length;
    const totalValue   = orders.reduce((s, o) => s + (parseFloat(o.total_amount) || 0), 0);

    return (
        <div className="min-h-screen bg-slate-50">
            {/* ── Page header ── */}
            <div className="bg-white border-b border-slate-200 px-8 py-5">
                <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-end justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Sales Orders</h1>
                        <p className="text-sm text-slate-500 mt-0.5">Track and manage all customer orders</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="relative">
                            <Search className="absolute left-3 top-2.5 text-slate-400 w-4 h-4"/>
                            <input
                                type="text"
                                placeholder="Search order, customer, buyer PO…"
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                className="pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none w-64"
                            />
                        </div>
                        <Link
                            to="/accounts/sales/new"
                            className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-lg shadow-sm transition-colors shrink-0"
                        >
                            <Plus size={15}/> New Order
                        </Link>
                    </div>
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-8 py-6 space-y-5">

                {/* ── Stats ── */}
                {!loading && (
                    <div className="grid grid-cols-3 gap-4">
                        {[
                            { label: 'Total Orders',  value: totalOrders,                 sub: 'all time' },
                            { label: 'Open Orders',   value: activeOrders,               sub: 'active / pending' },
                            { label: 'Total Value',   value: `₹${totalValue.toLocaleString('en-IN', { minimumFractionDigits: 0 })}`, sub: 'across all orders' },
                        ].map(({ label, value, sub }) => (
                            <div key={label} className="bg-white border border-slate-200 rounded-xl px-5 py-4">
                                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">{label}</p>
                                <p className="text-2xl font-black text-slate-900 mt-1 tabular-nums">{value}</p>
                                <p className="text-xs text-slate-400 mt-0.5">{sub}</p>
                            </div>
                        ))}
                    </div>
                )}

                {/* ── Status filter tabs ── */}
                <div className="flex gap-1 flex-wrap">
                    {STATUS_FILTERS.map(s => (
                        <button
                            key={s}
                            onClick={() => setStatus(s)}
                            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
                                statusFilter === s
                                    ? 'bg-indigo-600 text-white shadow-sm'
                                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                            }`}
                        >
                            {s === 'All' ? `All (${orders.length})` : s.replace(/_/g, ' ')}
                        </button>
                    ))}
                </div>

                {/* ── Table ── */}
                {loading ? (
                    <div className="flex justify-center py-20">
                        <Loader2 className="w-7 h-7 animate-spin text-indigo-500"/>
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="text-center py-20 bg-white rounded-xl border border-dashed border-slate-200">
                        <FileText className="w-8 h-8 text-slate-300 mx-auto mb-3"/>
                        <p className="text-slate-400 font-medium">
                            {search || statusFilter !== 'All' ? 'No orders match your filters' : 'No sales orders yet'}
                        </p>
                        {!search && statusFilter === 'All' && (
                            <Link to="/accounts/sales/new" className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-indigo-600 hover:underline">
                                <Plus size={14}/> Create your first order
                            </Link>
                        )}
                    </div>
                ) : (
                    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                        <table className="w-full text-sm text-left">
                            <thead>
                                <tr className="border-b border-slate-100 bg-slate-50/80">
                                    <th className="px-5 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Order #</th>
                                    <th className="px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Customer</th>
                                    <th className="px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider hidden md:table-cell">Buyer PO</th>
                                    <th className="px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider hidden lg:table-cell">Order Date</th>
                                    <th className="px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider hidden lg:table-cell">Delivery</th>
                                    <th className="px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider text-right hidden md:table-cell">POs</th>
                                    <th className="px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Status</th>
                                    <th className="px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filtered.map((so, idx) => (
                                    <tr
                                        key={(so.id ?? so.sales_order_id) ?? `row-${idx}`}
                                        onClick={() => setSelectedSO(so)}
                                        className="hover:bg-indigo-50/40 cursor-pointer transition-colors group"
                                    >
                                        <td className="px-5 py-4">
                                            <p className="font-bold text-indigo-700 group-hover:text-indigo-800">{so.order_number}</p>
                                        </td>
                                        <td className="px-4 py-4">
                                            <p className="font-medium text-slate-800">{so.customer_name}</p>
                                        </td>
                                        <td className="px-4 py-4 text-slate-500 font-mono text-xs hidden md:table-cell">
                                            {so.buyer_po_number || <span className="text-slate-300">—</span>}
                                        </td>
                                        <td className="px-4 py-4 text-slate-500 hidden lg:table-cell">{fmt(so.order_date)}</td>
                                        <td className="px-4 py-4 hidden lg:table-cell">
                                            {so.delivery_date ? (
                                                <span className={`text-sm ${new Date(so.delivery_date) < new Date() && so.status !== 'COMPLETED' ? 'text-red-600 font-semibold' : 'text-slate-500'}`}>
                                                    {fmt(so.delivery_date)}
                                                </span>
                                            ) : <span className="text-slate-300">—</span>}
                                        </td>
                                        <td className="px-4 py-4 text-right hidden md:table-cell">
                                            <span className="text-sm font-semibold text-slate-600 tabular-nums">
                                                {so.purchase_orders?.length ?? 0}
                                            </span>
                                        </td>
                                        <td className="px-4 py-4">
                                            <StatusBadge status={so.status}/>
                                        </td>
                                        <td className="px-4 py-4 text-right" onClick={e => e.stopPropagation()}>
                                            <Link
                                                to={`/accounts/sales/${so.id ?? so.sales_order_id}/edit`}
                                                className="inline-flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 px-2.5 py-1.5 rounded-lg border border-transparent hover:border-indigo-100 transition-colors"
                                                title="Edit order"
                                            >
                                                <Pencil size={13}/> Edit
                                            </Link>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/50 text-xs text-slate-400">
                            Showing {filtered.length} of {orders.length} order{orders.length !== 1 ? 's' : ''}
                        </div>
                    </div>
                )}
            </div>

            {/* ── Detail modal ── */}
            {selectedSO && (
                <SalesOrderDetailModal
                    so={selectedSO}
                    onClose={() => setSelectedSO(null)}
                />
            )}
        </div>
    );
};

export default SalesOrderListPage;

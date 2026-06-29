import { useState, useEffect, useMemo } from 'react';
import { Loader2, AlertTriangle, Receipt, Check } from 'lucide-react';
import { accountingApi } from '../../../api/accountingApi';
import { purchaseDeptApi } from '../../../api/purchaseDeptApi';
import InvoiceModal, { PaymentPill } from '../../purchase_department/InvoiceModal';
import InwardDisplayModal from '../../purchase_department/InwardDisplayModal';

const STATUS_FILTERS = [
    { key: 'ALL',            label: 'All'     },
    { key: 'UNPAID',         label: 'Unpaid'  },
    { key: 'PARTIALLY_PAID', label: 'Partial' },
    { key: 'OVERDUE',        label: 'Overdue' },
    { key: 'PAID',           label: 'Paid'    },
];

const STATUS_ACTIVE_CLS = {
    ALL:            'bg-slate-200 text-slate-800 border-slate-300',
    UNPAID:         'bg-amber-100 text-amber-800 border-amber-200',
    PARTIALLY_PAID: 'bg-blue-100 text-blue-800 border-blue-200',
    OVERDUE:        'bg-red-100 text-red-800 border-red-200',
    PAID:           'bg-emerald-100 text-emerald-800 border-emerald-200',
};

function itemSummary(items) {
    if (!items.length) return null;
    const names = items.slice(0, 3).map(it => {
        if (it.fabric_type_name) return it.fabric_type_name + (it.fabric_color_name ? ` ${it.fabric_color_name}` : '');
        if (it.trim_item_name)   return it.trim_item_name  + (it.variant_color_name ? ` ${it.variant_color_name}` : '');
        return it.description || 'Item';
    });
    return names.join(', ') + (items.length > 3 ? ` +${items.length - 3} more` : '');
}

const fmt = (n) => '₹' + Math.round(n).toLocaleString('en-IN');

export default function PurchaseInvoicesPage() {
    const [poGroups,     setPoGroups]     = useState([]);   // [{ po, inwards[], invoices[] }]
    const [loading,      setLoading]      = useState(true);
    const [err,          setErr]          = useState(null);
    const [tab,          setTab]          = useState('pending');
    const [statusFilter, setStatusFilter] = useState('ALL');
    const [selected,     setSelected]     = useState(new Set()); // Set<inwardId>
    const [selectedPoId, setSelectedPoId] = useState(null);
    const [openInvoice,  setOpenInvoice]  = useState(null); // { invoice|null, inwards[], defaultSelectedIds }
    const [openGrn,      setOpenGrn]      = useState(null); // { inward, po }

    const load = async () => {
        setLoading(true); setErr(null);
        try {
            const posRes = await accountingApi.getPurchaseOrders();
            const pos = posRes.data?.data || posRes.data || [];
            const groups = await Promise.all(
                pos.map(async (po) => {
                    const [iwRes, invRes] = await Promise.all([
                        purchaseDeptApi.getInwards(po.id).catch(() => ({ data: [] })),
                        purchaseDeptApi.getInvoices(po.id).catch(() => ({ data: [] })),
                    ]);
                    return {
                        po,
                        inwards:  iwRes.data?.data  || iwRes.data  || [],
                        invoices: invRes.data?.data || invRes.data || [],
                    };
                })
            );
            setPoGroups(groups);
        } catch (e) {
            setErr(e?.response?.data?.error || 'Failed to load data.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Groups that have at least one uninvoiced GRN
    const pendingGroups = useMemo(() =>
        poGroups
            .map(g => ({ ...g, pending: g.inwards.filter(iw => iw.invoice_id == null) }))
            .filter(g => g.pending.length > 0),
        [poGroups]
    );

    // Flat invoice list, filtered by status
    const allInvoices = useMemo(() => {
        const flat = poGroups.flatMap(g =>
            g.invoices.map(inv => ({ ...inv, _po: g.po, _allInwards: g.inwards }))
        );
        return statusFilter === 'ALL' ? flat : flat.filter(inv => inv.payment_status === statusFilter);
    }, [poGroups, statusFilter]);

    // Header stats
    const pendingGrnCount = pendingGroups.reduce((s, g) => s + g.pending.length, 0);
    const unpaidTotal = poGroups
        .flatMap(g => g.invoices)
        .filter(inv => ['UNPAID', 'PARTIALLY_PAID', 'OVERDUE'].includes(inv.payment_status))
        .reduce((s, inv) => s + (parseFloat(inv.amount) || 0), 0);

    // Invoice footer totals
    const totalAmt   = allInvoices.reduce((s, inv) => s + (parseFloat(inv.amount) || 0), 0);
    const paidAmt    = allInvoices.filter(i => i.payment_status === 'PAID').reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);

    // Status chip counts (unfiltered)
    const statusCounts = useMemo(() => {
        const all = poGroups.flatMap(g => g.invoices);
        return STATUS_FILTERS.reduce((acc, f) => {
            acc[f.key] = f.key === 'ALL' ? all.length : all.filter(i => i.payment_status === f.key).length;
            return acc;
        }, {});
    }, [poGroups]);

    // Selection helpers
    const toggleSelect = (iwId, poId) => {
        if (selectedPoId && selectedPoId !== poId) return; // cross-PO not allowed
        setSelectedPoId(poId);
        setSelected(prev => {
            const s = new Set(prev);
            if (s.has(iwId)) { s.delete(iwId); } else { s.add(iwId); }
            if (s.size === 0) setSelectedPoId(null);
            return s;
        });
    };

    const selectAllInGroup = (group) => {
        setSelected(prev => {
            const s = new Set(prev);
            const allSel = group.pending.every(iw => s.has(iw.id));
            if (allSel) {
                group.pending.forEach(iw => s.delete(iw.id));
                if (s.size === 0) setSelectedPoId(null);
            } else {
                group.pending.forEach(iw => s.add(iw.id));
                setSelectedPoId(group.po.id);
            }
            return s;
        });
    };

    const handleCreateInvoice = (group, preselectIds) => {
        setOpenInvoice({
            invoice: null,
            inwards: group.inwards,
            defaultSelectedIds: new Set(preselectIds),
        });
    };

    const handleViewInvoice = (inv) => {
        setOpenInvoice({
            invoice: inv,
            inwards: inv._allInwards,
            defaultSelectedIds: new Set(),
        });
    };

    const handleSaved = () => {
        setOpenInvoice(null);
        setSelected(new Set());
        setSelectedPoId(null);
        load();
    };

    const handleDeleted = () => {
        setOpenInvoice(null);
        load();
    };

    if (loading) return (
        <div className="flex items-center justify-center h-64">
            <Loader2 className="animate-spin text-slate-400" size={28} />
        </div>
    );

    if (err) return (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600 max-w-lg mt-8">
            <AlertTriangle size={16} /> {err}
        </div>
    );

    return (
        <>
            {openGrn && (
                <InwardDisplayModal
                    inward={openGrn.inward}
                    poItems={[]}
                    poCode={openGrn.po.po_code}
                    poId={openGrn.po.id}
                    onClose={() => setOpenGrn(null)}
                    onDeleted={() => { setOpenGrn(null); load(); }}
                />
            )}
            {openInvoice && (
                <InvoiceModal
                    inwards={openInvoice.inwards}
                    invoice={openInvoice.invoice}
                    initialMode={openInvoice.invoice ? 'view' : 'create'}
                    defaultSelectedIds={openInvoice.defaultSelectedIds}
                    onClose={() => setOpenInvoice(null)}
                    onSaved={handleSaved}
                    onDeleted={handleDeleted}
                />
            )}

            <div className="max-w-4xl mx-auto space-y-6">
                {/* Page header */}
                <div className="flex items-start justify-between flex-wrap gap-3">
                    <div>
                        <h1 className="text-xl font-black text-slate-800">Purchase Invoices</h1>
                        <p className="text-xs text-slate-500 mt-0.5">GRN → Invoice → Payment tracking across all purchase orders</p>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                        {pendingGrnCount > 0 && (
                            <span className="text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-full">
                                {pendingGrnCount} GRN{pendingGrnCount !== 1 ? 's' : ''} pending invoice
                            </span>
                        )}
                        {unpaidTotal > 0 && (
                            <span className="text-xs font-bold text-red-700 bg-red-50 border border-red-200 px-3 py-1.5 rounded-full">
                                {fmt(unpaidTotal)} unpaid
                            </span>
                        )}
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex items-center gap-1 border-b border-slate-200">
                    {[
                        { key: 'pending',  label: pendingGrnCount > 0 ? `Pending Invoice (${pendingGrnCount})` : 'Pending Invoice' },
                        { key: 'invoices', label: 'All Invoices' },
                    ].map(t => (
                        <button
                            key={t.key}
                            onClick={() => setTab(t.key)}
                            className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition ${
                                tab === t.key
                                    ? 'border-orange-500 text-orange-600'
                                    : 'border-transparent text-slate-500 hover:text-slate-700'
                            }`}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>

                {/* ── PENDING TAB ── */}
                {tab === 'pending' && (
                    <div className="space-y-4">
                        {pendingGroups.length === 0 ? (
                            <div className="text-center py-20 text-slate-400">
                                <Receipt size={36} className="mx-auto mb-3 opacity-20" />
                                <p className="text-sm font-semibold">All GRNs are invoiced</p>
                                <p className="text-xs mt-1">No pending GRNs across any purchase order.</p>
                            </div>
                        ) : (
                            pendingGroups.map(group => {
                                const groupSel = group.pending.filter(iw => selected.has(iw.id));
                                const allSel   = group.pending.length > 0 && group.pending.every(iw => selected.has(iw.id));
                                const isOtherPo = selectedPoId && selectedPoId !== group.po.id;
                                return (
                                    <div key={group.po.id} className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                                        {/* PO group header */}
                                        <div className="flex items-center justify-between gap-3 px-4 py-3 bg-slate-50 border-b border-slate-200 flex-wrap">
                                            <div>
                                                <p className="text-sm font-black text-slate-800">
                                                    {group.po.po_code || `PO #${group.po.id}`}
                                                    <span className="mx-2 text-slate-300">·</span>
                                                    <span className="text-slate-600 font-semibold">{group.po.supplier_name || 'Unknown Supplier'}</span>
                                                </p>
                                                <p className="text-[11px] text-slate-500 mt-0.5">
                                                    {group.pending.length} GRN{group.pending.length !== 1 ? 's' : ''} awaiting invoice
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                {groupSel.length > 1 && selectedPoId === group.po.id && (
                                                    <button
                                                        onClick={() => {
                                                            handleCreateInvoice(group, groupSel.map(iw => iw.id));
                                                            setSelected(new Set());
                                                            setSelectedPoId(null);
                                                        }}
                                                        className="text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 px-3 py-1.5 rounded-lg transition flex items-center gap-1.5"
                                                    >
                                                        <Receipt size={12} />
                                                        Create Invoice for {groupSel.length} GRNs
                                                    </button>
                                                )}
                                                {!isOtherPo && (
                                                    <button
                                                        onClick={() => selectAllInGroup(group)}
                                                        className="text-[11px] font-semibold text-slate-500 hover:text-slate-700 px-2.5 py-1.5 rounded-lg hover:bg-slate-200 transition"
                                                    >
                                                        {allSel ? 'Deselect all' : 'Select all'}
                                                    </button>
                                                )}
                                            </div>
                                        </div>

                                        {/* GRN rows */}
                                        <div className="divide-y divide-slate-100">
                                            {group.pending.map(iw => {
                                                const isSel = selected.has(iw.id);
                                                const disabled = !!isOtherPo;
                                                const summary = itemSummary(iw.items || []);
                                                return (
                                                    <div
                                                        key={iw.id}
                                                        className={`flex items-start gap-3 px-4 py-3 transition ${isSel ? 'bg-indigo-50' : 'hover:bg-slate-50/60'}`}
                                                    >
                                                        {/* Checkbox */}
                                                        <button
                                                            onClick={() => !disabled && toggleSelect(iw.id, group.po.id)}
                                                            title={disabled ? 'Clear selection from other PO first' : undefined}
                                                            className={`mt-0.5 w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition ${
                                                                isSel
                                                                    ? 'bg-indigo-600 border-indigo-600'
                                                                    : disabled
                                                                        ? 'border-slate-200 opacity-30 cursor-not-allowed'
                                                                        : 'border-slate-300 hover:border-indigo-400 cursor-pointer'
                                                            }`}
                                                        >
                                                            {isSel && <Check size={10} className="text-white" strokeWidth={3} />}
                                                        </button>

                                                        {/* GRN info */}
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-sm font-bold text-slate-800 flex items-center gap-2 flex-wrap">
                                                                {iw.grn_number || `GRN #${iw.id}`}
                                                                {iw.condition && (
                                                                    <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full ${
                                                                        iw.condition === 'GOOD'
                                                                            ? 'bg-emerald-100 text-emerald-700'
                                                                            : 'bg-amber-100 text-amber-700'
                                                                    }`}>{iw.condition}</span>
                                                                )}
                                                            </p>
                                                            <p className="text-[11px] text-slate-500 mt-0.5">
                                                                {iw.received_date
                                                                    ? new Date(iw.received_date).toLocaleDateString('en', { dateStyle: 'medium' })
                                                                    : '—'}
                                                                {iw.created_by_name ? ` · by ${iw.created_by_name}` : ''}
                                                                {' · '}{(iw.items || []).length} item{(iw.items || []).length !== 1 ? 's' : ''}
                                                            </p>
                                                            {summary && (
                                                                <p className="text-[11px] text-slate-500 mt-0.5 truncate">{summary}</p>
                                                            )}
                                                        </div>

                                                        {/* Actions */}
                                                        <div className="flex items-center gap-2 shrink-0">
                                                            <button
                                                                onClick={() => setOpenGrn({ inward: iw, po: group.po })}
                                                                className="text-[11px] font-semibold text-slate-500 hover:text-slate-700 border border-slate-200 hover:border-slate-300 px-2.5 py-1.5 rounded-lg transition"
                                                            >
                                                                View GRN
                                                            </button>
                                                            <button
                                                                onClick={() => handleCreateInvoice(group, [iw.id])}
                                                                className="text-[11px] font-bold text-white bg-indigo-600 hover:bg-indigo-700 px-2.5 py-1.5 rounded-lg transition flex items-center gap-1"
                                                            >
                                                                <Receipt size={11} />
                                                                Invoice
                                                            </button>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                )}

                {/* ── INVOICES TAB ── */}
                {tab === 'invoices' && (
                    <div className="space-y-4">
                        {/* Status filter chips */}
                        <div className="flex items-center gap-2 flex-wrap">
                            {STATUS_FILTERS.map(f => (
                                <button
                                    key={f.key}
                                    onClick={() => setStatusFilter(f.key)}
                                    className={`text-xs font-bold px-3 py-1.5 rounded-full border transition ${
                                        statusFilter === f.key
                                            ? STATUS_ACTIVE_CLS[f.key]
                                            : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                                    }`}
                                >
                                    {f.label}
                                    <span className="ml-1.5 opacity-60">({statusCounts[f.key] ?? 0})</span>
                                </button>
                            ))}
                        </div>

                        {allInvoices.length === 0 ? (
                            <div className="text-center py-20 text-slate-400">
                                <Receipt size={36} className="mx-auto mb-3 opacity-20" />
                                <p className="text-sm font-semibold">
                                    {statusFilter === 'ALL' ? 'No invoices yet' : `No ${statusFilter.replace('_', ' ').toLowerCase()} invoices`}
                                </p>
                            </div>
                        ) : (
                            <>
                                <div className="space-y-2">
                                    {allInvoices.map(inv => {
                                        const linkedCount = (inv.inwards || []).length || inv.inward_count || 0;
                                        return (
                                            <div
                                                key={inv.id}
                                                onClick={() => handleViewInvoice(inv)}
                                                className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex items-start gap-4 shadow-sm hover:shadow-md hover:border-slate-300 transition cursor-pointer"
                                            >
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <p className="text-sm font-black text-slate-800">
                                                            {inv.invoice_number || `Invoice #${inv.id}`}
                                                        </p>
                                                        <PaymentPill status={inv.payment_status} />
                                                    </div>
                                                    <p className="text-[11px] text-slate-500 mt-0.5">
                                                        {inv._po.po_code || `PO #${inv._po.id}`}
                                                        {inv._po.supplier_name ? ` · ${inv._po.supplier_name}` : ''}
                                                        {inv.invoice_date
                                                            ? ` · ${new Date(inv.invoice_date).toLocaleDateString('en', { dateStyle: 'medium' })}`
                                                            : ''}
                                                    </p>
                                                    <p className="text-[11px] text-slate-400 mt-0.5">
                                                        Covers {linkedCount} GRN{linkedCount !== 1 ? 's' : ''}
                                                        {inv.scan_url ? ' · scan attached' : ''}
                                                        {inv.notes ? ' · has notes' : ''}
                                                    </p>
                                                </div>
                                                <div className="text-right shrink-0">
                                                    <p className="text-base font-black text-slate-800 tabular-nums">
                                                        {fmt(parseFloat(inv.amount || 0))}
                                                    </p>
                                                    <p className="text-[11px] text-indigo-500 font-semibold mt-0.5">View / Edit →</p>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* Footer totals */}
                                <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 flex items-center justify-between flex-wrap gap-3">
                                    <p className="text-xs text-slate-500">
                                        {allInvoices.length} invoice{allInvoices.length !== 1 ? 's' : ''}
                                        {statusFilter !== 'ALL' ? ' matching filter' : ''}
                                    </p>
                                    <div className="flex items-center gap-4 text-xs">
                                        <span className="text-slate-600">
                                            Total: <strong className="text-slate-800 tabular-nums">{fmt(totalAmt)}</strong>
                                        </span>
                                        <span className="text-emerald-600">
                                            Paid: <strong className="tabular-nums">{fmt(paidAmt)}</strong>
                                        </span>
                                        <span className="text-red-600">
                                            Outstanding: <strong className="tabular-nums">{fmt(Math.max(0, totalAmt - paidAmt))}</strong>
                                        </span>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                )}
            </div>
        </>
    );
}

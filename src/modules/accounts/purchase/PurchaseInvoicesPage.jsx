import { useState, useEffect, useMemo, useRef } from 'react';
import { Loader2, AlertTriangle, Receipt, Check, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { accountingApi } from '../../../api/accountingApi';
import { purchaseDeptApi } from '../../../api/purchaseDeptApi';
import InvoiceModal, { PaymentPill, MatchPill } from '../../purchase_department/InvoiceModal';
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

const PAGE_SIZE = 15;

// Shared prev/next control for both tabs — `total` is the server's count of
// qualifying POs for the current tab+filter, not what's currently loaded.
function PaginationBar({ page, totalPages, total, loading, onPrev, onNext }) {
    if (total === 0) return null;
    return (
        <div className="flex items-center justify-between px-1 pt-1">
            <p className="text-xs text-slate-400">
                Page {page} of {totalPages} · {total} PO{total !== 1 ? 's' : ''}
            </p>
            <div className="flex items-center gap-2">
                <button
                    onClick={onPrev}
                    disabled={loading || page <= 1}
                    className="flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-700 disabled:opacity-30 disabled:cursor-not-allowed border border-slate-200 rounded-lg px-2.5 py-1.5 transition"
                >
                    <ChevronLeft size={13} /> Prev
                </button>
                <button
                    onClick={onNext}
                    disabled={loading || page >= totalPages}
                    className="flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-700 disabled:opacity-30 disabled:cursor-not-allowed border border-slate-200 rounded-lg px-2.5 py-1.5 transition"
                >
                    Next <ChevronRight size={13} />
                </button>
            </div>
        </div>
    );
}

export default function PurchaseInvoicesPage() {
    const [poGroups,     setPoGroups]     = useState([]);   // current PAGE only: [{ po, inwards[], invoices[] }]
    const [loading,      setLoading]      = useState(true);
    const [err,          setErr]          = useState(null);
    const [tab,          setTab]          = useState('pending');
    const [statusFilter, setStatusFilter] = useState('ALL');
    const [search,       setSearch]       = useState('');
    const [selected,     setSelected]     = useState(new Set()); // Set<inwardId>
    const [selectedPoId, setSelectedPoId] = useState(null);
    const [openInvoice,  setOpenInvoice]  = useState(null); // { invoice|null, inwards[], defaultSelectedIds, poItems[] }
    const poItemsCache = useRef({});
    const [openGrn,      setOpenGrn]      = useState(null); // { inward, po }

    // Server-side pagination — page/total describe the current tab+filter's
    // qualifying PO count, not what's loaded client-side. `stats` carries the
    // global (unpaginated) aggregates the header badges/chips/footer need.
    const [page,  setPage]  = useState(1);
    const [total, setTotal] = useState(0);
    const [stats, setStats] = useState({});

    // Fetches one page of qualifying POs for the current tab/filter, then their
    // inwards+invoices (bounded to `pageSize` POs, not every PO in the system).
    const load = async (pageArg = 1) => {
        setLoading(true); setErr(null);
        try {
            const params = { tab, page: pageArg, pageSize: PAGE_SIZE };
            if (tab === 'invoices') {
                if (statusFilter !== 'ALL') params.status = statusFilter;
                if (search.trim()) params.search = search.trim();
            }
            const overviewRes = await accountingApi.getPurchaseOrdersInvoicingOverview(params);
            const body = overviewRes.data || {};
            const pos = body.data || [];
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
            setTotal(body.total || 0);
            setStats(body.stats || {});
            setPage(pageArg);
            // A fresh page load shows a different set of POs — any prior GRN
            // selection (and its cross-PO lock) no longer refers to anything visible.
            setSelected(new Set());
            setSelectedPoId(null);
        } catch (e) {
            setErr(e?.response?.data?.error || 'Failed to load data.');
        } finally {
            setLoading(false);
        }
    };

    // Re-fetches just the one PO touched by a save/delete (inwards + invoices)
    // and splices it into poGroups in place, plus a stats refresh — instead of
    // reloading the whole page. If that PO drops to zero pending GRNs, the
    // existing pendingGroups filter below naturally drops its card; `total`
    // (the pagination count) goes stale by one until the next page load/nav,
    // which is an acceptable, self-correcting tradeoff for not refetching.
    const refreshAfterInvoiceChange = async (poId) => {
        if (!poId) { load(page); return; }
        try {
            const [iwRes, invRes, overviewRes] = await Promise.all([
                purchaseDeptApi.getInwards(poId).catch(() => ({ data: [] })),
                purchaseDeptApi.getInvoices(poId).catch(() => ({ data: [] })),
                accountingApi.getPurchaseOrdersInvoicingOverview({
                    tab, page, pageSize: PAGE_SIZE,
                    ...(tab === 'invoices' && statusFilter !== 'ALL' ? { status: statusFilter } : {}),
                    ...(tab === 'invoices' && search.trim() ? { search: search.trim() } : {}),
                }).catch(() => null),
            ]);
            const inwards  = iwRes.data?.data  || iwRes.data  || [];
            const invoices = invRes.data?.data || invRes.data || [];
            setPoGroups(prev => prev.map(g => g.po.id === poId ? { ...g, inwards, invoices } : g));
            if (overviewRes) setStats(overviewRes.data?.stats || {});
        } catch (e) {
            setErr(e?.response?.data?.error || 'Failed to refresh.');
        }
    };

    // Initial load.
    useEffect(() => { load(1); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Tab/status/search changes reset to page 1 and refetch — debounced only for
    // free-text search so we're not firing a request per keystroke. Skips the
    // very first render since the effect above already handles it.
    const firstRun = useRef(true);
    useEffect(() => {
        if (firstRun.current) { firstRun.current = false; return; }
        const t = setTimeout(() => load(1), search ? 350 : 0);
        return () => clearTimeout(t);
    }, [tab, statusFilter, search]); // eslint-disable-line react-hooks/exhaustive-deps

    // Groups that have at least one uninvoiced GRN
    const pendingGroups = useMemo(() =>
        poGroups
            .map(g => ({ ...g, pending: g.inwards.filter(iw => iw.invoice_id == null) }))
            .filter(g => g.pending.length > 0),
        [poGroups]
    );

    // Flat invoice list, filtered by status + search (PO code, supplier, invoice number)
    const allInvoices = useMemo(() => {
        const flat = poGroups.flatMap(g =>
            g.invoices.map(inv => ({ ...inv, _po: g.po, _allInwards: g.inwards }))
        );
        const byStatus = statusFilter === 'ALL' ? flat : flat.filter(inv => inv.payment_status === statusFilter);
        const q = search.trim().toLowerCase();
        if (!q) return byStatus;
        return byStatus.filter(inv => [
            inv.invoice_number, inv._po?.po_code, inv._po?.supplier_name, String(inv._po?.id ?? ''),
        ].some(v => (v || '').toString().toLowerCase().includes(q)));
    }, [poGroups, statusFilter, search]);

    // Same invoices, grouped back under their PO — same shape/order as
    // pendingGroups so the two tabs read consistently, one card per PO
    // instead of every invoice from every supplier interleaved in one list.
    const invoicesByPo = useMemo(() => {
        const byPoId = new Map();
        allInvoices.forEach(inv => {
            const poId = inv._po.id;
            if (!byPoId.has(poId)) byPoId.set(poId, { po: inv._po, invoices: [] });
            byPoId.get(poId).invoices.push(inv);
        });
        // Preserve poGroups' order (created_at DESC from the backend) rather
        // than Map insertion order, which would just be "PO of the first
        // matching invoice encountered."
        return poGroups
            .map(g => byPoId.get(g.po.id))
            .filter(Boolean);
    }, [allInvoices, poGroups]);

    // Header stats — global aggregates from the server, not derived from the
    // current page's poGroups (which is now just one page of POs).
    const pendingGrnCount = stats.pending_grn_count || 0;
    const unpaidTotal     = stats.unpaid_total || 0;

    // Invoice footer totals — summed server-side over every invoice matching
    // the current status+search filter (all pages), not just the loaded page.
    const totalAmt = stats.filtered_total_amt || 0;
    const paidAmt  = stats.filtered_paid_amt  || 0;

    // Status chip counts (unfiltered, global — from server stats)
    const statusCounts = stats.status_counts || {};

    // Pagination
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

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

    const fetchPoItems = async (poId) => {
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

    const handleCreateInvoice = async (group, preselectIds) => {
        const poItems = await fetchPoItems(group.po.id);
        setOpenInvoice({
            invoice: null,
            inwards: group.inwards,
            defaultSelectedIds: new Set(preselectIds),
            poItems,
            po: group.po,
        });
    };

    const handleViewInvoice = async (inv) => {
        const poItems = await fetchPoItems(inv._po.id);
        setOpenInvoice({
            invoice: inv,
            inwards: inv._allInwards,
            defaultSelectedIds: new Set(),
            poItems,
            po: inv._po,
        });
    };

    const handleSaved = () => {
        const poId = openInvoice?.po?.id;
        setOpenInvoice(null);
        setSelected(new Set());
        setSelectedPoId(null);
        refreshAfterInvoiceChange(poId);
    };

    const handleDeleted = () => {
        const poId = openInvoice?.po?.id;
        setOpenInvoice(null);
        refreshAfterInvoiceChange(poId);
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
                    onDeleted={() => { const poId = openGrn.po.id; setOpenGrn(null); refreshAfterInvoiceChange(poId); }}
                />
            )}
            {openInvoice && (
                <InvoiceModal
                    inwards={openInvoice.inwards}
                    poItems={openInvoice.poItems || []}
                    invoice={openInvoice.invoice}
                    po={openInvoice.po || null}
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
                        <PaginationBar page={page} totalPages={totalPages} total={total} loading={loading} onPrev={() => load(page - 1)} onNext={() => load(page + 1)} />
                    </div>
                )}

                {/* ── INVOICES TAB ── */}
                {tab === 'invoices' && (
                    <div className="space-y-4">
                        {/* Search */}
                        <div className="relative">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                type="text"
                                placeholder="Search PO code, supplier, invoice number…"
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                className="w-full text-sm border border-slate-200 rounded-xl pl-9 pr-3 py-2 focus:outline-none focus:border-indigo-400"
                            />
                            {search && (
                                <button
                                    onClick={() => setSearch('')}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400 hover:text-slate-600 uppercase tracking-wider"
                                >
                                    Clear
                                </button>
                            )}
                        </div>

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
                                    {search
                                        ? 'No invoices match your search'
                                        : statusFilter === 'ALL' ? 'No invoices yet' : `No ${statusFilter.replace('_', ' ').toLowerCase()} invoices`}
                                </p>
                            </div>
                        ) : (
                            <>
                                {/* One card per PO, invoices grouped underneath — same layout
                                    convention as the Pending tab, so invoices from different
                                    suppliers/POs aren't interleaved in one flat list. */}
                                <div className="space-y-4">
                                    {invoicesByPo.map(group => (
                                        <div key={group.po.id} className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                                            <div className="flex items-center justify-between gap-3 px-4 py-3 bg-slate-50 border-b border-slate-200 flex-wrap">
                                                <div>
                                                    <p className="text-sm font-black text-slate-800">
                                                        {group.po.po_code || `PO #${group.po.id}`}
                                                        <span className="mx-2 text-slate-300">·</span>
                                                        <span className="text-slate-600 font-semibold">{group.po.supplier_name || 'Unknown Supplier'}</span>
                                                    </p>
                                                    <p className="text-[11px] text-slate-500 mt-0.5">
                                                        {group.invoices.length} invoice{group.invoices.length !== 1 ? 's' : ''}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="divide-y divide-slate-100">
                                                {group.invoices.map(inv => {
                                                    const linkedCount = (inv.inwards || []).length || inv.inward_count || 0;
                                                    return (
                                                        <div
                                                            key={inv.id}
                                                            onClick={() => handleViewInvoice(inv)}
                                                            className="flex items-start gap-4 px-4 py-3 hover:bg-slate-50/60 transition cursor-pointer"
                                                        >
                                                            <div className="flex-1 min-w-0">
                                                                <div className="flex items-center gap-2 flex-wrap">
                                                                    <p className="text-sm font-black text-slate-800">
                                                                        {inv.invoice_number || `Invoice #${inv.id}`}
                                                                    </p>
                                                                    <PaymentPill status={inv.payment_status} />
                                                                    <MatchPill status={inv.match_status} />
                                                                </div>
                                                                <p className="text-[11px] text-slate-500 mt-0.5">
                                                                    {inv.invoice_date
                                                                        ? new Date(inv.invoice_date).toLocaleDateString('en', { dateStyle: 'medium' })
                                                                        : '—'}
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
                                        </div>
                                    ))}
                                </div>

                                {/* Footer totals — counts/sums span every matching invoice
                                    across all pages (server stats), not just this page. */}
                                <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 flex items-center justify-between flex-wrap gap-3">
                                    <p className="text-xs text-slate-500">
                                        {stats.filtered_count ?? allInvoices.length} invoice{(stats.filtered_count ?? allInvoices.length) !== 1 ? 's' : ''} across {total} PO{total !== 1 ? 's' : ''}
                                        {(statusFilter !== 'ALL' || search) ? ' matching filter' : ''}
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

                                <PaginationBar page={page} totalPages={totalPages} total={total} loading={loading} onPrev={() => load(page - 1)} onNext={() => load(page + 1)} />
                            </>
                        )}
                    </div>
                )}
            </div>
        </>
    );
}

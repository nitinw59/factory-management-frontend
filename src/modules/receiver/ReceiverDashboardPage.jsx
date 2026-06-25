import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { jobWorkApi } from '../../api/jobWorkApi';
import {
    Loader, AlertCircle, PackageCheck, Package, X,
    CheckCircle2, RefreshCw, Clock, ArrowRight,
    Truck, FileText, ChevronDown, ChevronUp,
} from 'lucide-react';

// ── Helpers ────────────────────────────────────────────────────────────────────

const SIZE_ORDER = ['XXXS', 'XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', '3XL', '4XL'];
const sortSizes = (sizeSet) => [...sizeSet].sort((a, b) => {
    const ai = SIZE_ORDER.indexOf(a.toUpperCase()), bi = SIZE_ORDER.indexOf(b.toUpperCase());
    if (ai >= 0 && bi >= 0) return ai - bi;
    if (ai >= 0) return -1;
    if (bi >= 0) return 1;
    const an = parseFloat(a), bn = parseFloat(b);
    if (!isNaN(an) && !isNaN(bn)) return an - bn;
    return a.localeCompare(b);
});

const buildRollGroups = (items) => {
    const sizeSet = new Set(), groups = {};
    (items || []).forEach(item => {
        const rollKey   = String(item.roll_id ?? item.roll_number ?? 'Unknown');
        const rollLabel = String(item.roll_number ?? item.roll_id ?? '—');
        const color     = item.color_name ?? '—';
        const size      = item.size ?? '—';
        sizeSet.add(size);
        if (!groups[rollKey]) {
            groups[rollKey] = { rollKey, rollLabel, color, sizes: {}, items: [], total: 0 };
        }
        groups[rollKey].sizes[size] = (groups[rollKey].sizes[size] || 0) + 1;
        groups[rollKey].items.push(item);
        groups[rollKey].total++;
    });
    return { groups: Object.values(groups), sizes: sortSizes(sizeSet) };
};

const RECEIVE_OPTS = [
    { value: 'APPROVED',    label: 'Approved',    cls: 'text-emerald-700 bg-emerald-50 border-emerald-300' },
    { value: 'QC_REJECTED', label: 'QC Rejected', cls: 'text-rose-700 bg-rose-50 border-rose-300'          },
    { value: 'REPAIRED',    label: 'Repaired',    cls: 'text-amber-700 bg-amber-50 border-amber-300'       },
];

// ── GrnBanner (shown after successful receive) ─────────────────────────────────

const GrnBanner = ({ grn, onDismiss }) => (
    <div className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 text-center space-y-4">
            <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
                <PackageCheck size={26} className="text-emerald-600" />
            </div>
            <div>
                <div className="text-lg font-black text-slate-800">Goods Received</div>
                <div className="text-sm text-slate-400 mt-1">GRN auto-generated</div>
            </div>
            <div className="bg-slate-50 rounded-xl border border-slate-200 px-4 py-3">
                <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">GRN Number</div>
                <div className="text-xl font-black font-mono text-slate-800">{grn?.grn_number ?? '—'}</div>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
                {[
                    { label: 'Approved',    val: grn?.total_approved,     cls: 'bg-emerald-50 text-emerald-700' },
                    { label: 'QC Rejected', val: grn?.total_qc_rejected,  cls: 'bg-rose-50 text-rose-700'      },
                    { label: 'Repaired',    val: grn?.total_repaired,     cls: 'bg-amber-50 text-amber-700'    },
                ].map(({ label, val, cls }) => (
                    <div key={label} className={`rounded-xl p-2 ${cls}`}>
                        <div className="text-xl font-black">{val ?? 0}</div>
                        <div className="text-[10px] font-bold uppercase tracking-widest mt-0.5">{label}</div>
                    </div>
                ))}
            </div>
            <button
                onClick={onDismiss}
                className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black uppercase tracking-widest text-sm transition"
            >
                Done
            </button>
        </div>
    </div>
);

// ── ReceiveModal ───────────────────────────────────────────────────────────────

const ReceiveModal = ({ challan, onClose, onReceived }) => {
    const { groups, sizes } = useMemo(() => buildRollGroups(challan.items), [challan.items]);

    const [rollOutcomes, setRollOutcomes] = useState(() => {
        const init = {};
        groups.forEach(g => { init[g.rollKey] = 'APPROVED'; });
        return init;
    });
    const [dcNumber,     setDcNumber]     = useState('');
    const [vehicleNo,    setVehicleNo]    = useState('');
    const [notes,        setNotes]        = useState('');
    const [submitting,   setSubmitting]   = useState(false);
    const [error,        setError]        = useState('');

    const setAll = (status) =>
        setRollOutcomes(prev => Object.fromEntries(Object.keys(prev).map(k => [k, status])));

    const counts = useMemo(() => {
        const c = { APPROVED: 0, QC_REJECTED: 0, REPAIRED: 0 };
        groups.forEach(g => {
            const s = rollOutcomes[g.rollKey];
            c[s] = (c[s] || 0) + g.total;
        });
        return c;
    }, [rollOutcomes, groups]);

    const handleSubmit = async () => {
        setError(''); setSubmitting(true);
        try {
            const items = groups.flatMap(g =>
                g.items.map(item => ({
                    challan_item_id: item.challan_item_id,
                    received_status: rollOutcomes[g.rollKey],
                }))
            );
            const res = await jobWorkApi.receiveChallan(
                challan.id, items,
                dcNumber   || undefined,
                vehicleNo  || undefined,
                notes      || undefined,
            );
            // extract GRN from response
            const grn = res.data?.grn ?? res.data?.challan?.grn ?? null;
            onReceived(grn);
        } catch (err) {
            const msg = err?.response?.data?.error || err?.response?.data?.message || 'Failed to receive challan.';
            setError(msg);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm flex items-center justify-center p-3">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[95vh]">
                {/* Header */}
                <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
                    <div>
                        <div className="text-sm font-black text-slate-800">Receive Goods</div>
                        <div className="text-xs text-slate-400 mt-0.5">
                            {challan.challan_number ?? `Challan #${challan.id}`} · {challan.vendor_name} · {challan.items?.length ?? 0} pcs
                        </div>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 transition">
                        <X size={18} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
                    {/* Transit details */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">
                                Vendor DC Number <span className="text-slate-300">(optional)</span>
                            </label>
                            <input
                                type="text"
                                value={dcNumber}
                                onChange={e => setDcNumber(e.target.value)}
                                placeholder="e.g. DC-2026-099"
                                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                            />
                        </div>
                        <div>
                            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">
                                Vehicle Number <span className="text-slate-300">(optional)</span>
                            </label>
                            <input
                                type="text"
                                value={vehicleNo}
                                onChange={e => setVehicleNo(e.target.value)}
                                placeholder="e.g. MH12AB1234"
                                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                            />
                        </div>
                    </div>

                    {/* Batch context */}
                    <div className="bg-slate-50 rounded-xl border border-slate-200 px-4 py-3 grid grid-cols-2 gap-x-4 gap-y-2">
                        {[
                            ['Batch',   `#${challan.production_batch_id}${challan.batch_code ? ` · ${challan.batch_code}` : ''}`],
                            ['Product', challan.product_name ?? '—'],
                            ['Vendor',  challan.vendor_name  ?? '—'],
                            ['Line',    challan.line_name    ?? '—'],
                        ].map(([lbl, val]) => (
                            <div key={lbl}>
                                <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{lbl}</div>
                                <div className="text-xs font-bold text-slate-700 mt-0.5">{val}</div>
                            </div>
                        ))}
                        {challan.size_ratio && Object.keys(challan.size_ratio).length > 0 && (
                            <div className="col-span-2">
                                <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Size Ratio</div>
                                <div className="flex flex-wrap gap-1.5">
                                    {Object.entries(challan.size_ratio).map(([sz, r]) => (
                                        <span key={sz} className="text-[10px] font-black px-2 py-0.5 rounded bg-indigo-50 border border-indigo-100 text-indigo-700">
                                            {sz}: {r}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Quick set all */}
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest shrink-0">Set all rolls:</span>
                        {RECEIVE_OPTS.map(opt => (
                            <button
                                key={opt.value}
                                onClick={() => setAll(opt.value)}
                                className={`text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-lg border transition ${opt.cls}`}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>

                    {/* Roll table */}
                    <div className="overflow-x-auto rounded-xl border border-slate-200">
                        <table className="w-full text-xs border-collapse">
                            <thead>
                                <tr className="bg-slate-50 border-b border-slate-200">
                                    <th className="px-3 py-2.5 text-left font-black text-slate-500 uppercase tracking-widest text-[10px]">Roll</th>
                                    <th className="px-3 py-2.5 text-left font-black text-slate-500 uppercase tracking-widest text-[10px]">Color</th>
                                    {sizes.map(s => (
                                        <th key={s} className="px-2 py-2.5 text-center font-black text-slate-500 uppercase tracking-widest text-[10px]">{s}</th>
                                    ))}
                                    <th className="px-3 py-2.5 text-right font-black text-slate-500 uppercase tracking-widest text-[10px]">Pcs</th>
                                    <th className="px-4 py-2.5 text-left font-black text-slate-500 uppercase tracking-widest text-[10px]">Outcome</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {groups.map(g => {
                                    const chosen = rollOutcomes[g.rollKey];
                                    const optCfg = RECEIVE_OPTS.find(o => o.value === chosen);
                                    return (
                                        <tr key={g.rollKey} className="hover:bg-slate-50">
                                            <td className="px-3 py-2.5 font-mono text-slate-700 font-bold">{g.rollLabel}</td>
                                            <td className="px-3 py-2.5 text-slate-500">{g.color}</td>
                                            {sizes.map(s => (
                                                <td key={s} className="px-2 py-2.5 text-center font-bold text-slate-800">
                                                    {g.sizes[s] ?? 0}
                                                </td>
                                            ))}
                                            <td className="px-3 py-2.5 text-right font-black text-slate-900">{g.total}</td>
                                            <td className="px-4 py-2">
                                                <select
                                                    value={chosen}
                                                    onChange={e => setRollOutcomes(prev => ({ ...prev, [g.rollKey]: e.target.value }))}
                                                    className={`text-[10px] font-black uppercase tracking-widest rounded-lg border px-2.5 py-1.5 cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-400 ${optCfg?.cls ?? ''}`}
                                                >
                                                    {RECEIVE_OPTS.map(o => (
                                                        <option key={o.value} value={o.value}>{o.label}</option>
                                                    ))}
                                                </select>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    {/* Running tally */}
                    <div className="grid grid-cols-3 gap-3">
                        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-center">
                            <div className="text-3xl font-black text-emerald-700">{counts.APPROVED}</div>
                            <div className="text-[10px] font-bold uppercase tracking-widest text-emerald-600 mt-0.5">Approved</div>
                        </div>
                        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-center">
                            <div className="text-3xl font-black text-rose-700">{counts.QC_REJECTED}</div>
                            <div className="text-[10px] font-bold uppercase tracking-widest text-rose-600 mt-0.5">QC Rejected</div>
                        </div>
                        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-center">
                            <div className="text-3xl font-black text-amber-700">{counts.REPAIRED}</div>
                            <div className="text-[10px] font-bold uppercase tracking-widest text-amber-600 mt-0.5">Repaired</div>
                        </div>
                    </div>

                    {/* Notes */}
                    <div>
                        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">
                            Notes <span className="text-slate-300">(optional)</span>
                        </label>
                        <textarea
                            value={notes}
                            onChange={e => setNotes(e.target.value)}
                            rows={2}
                            placeholder="Any remarks about this receipt…"
                            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 resize-none focus:outline-none focus:ring-2 focus:ring-emerald-400"
                        />
                    </div>

                    {error && (
                        <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                            <AlertCircle size={13} /> {error}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-5 py-4 border-t border-slate-100 flex items-center justify-between shrink-0 bg-slate-50 rounded-b-2xl">
                    <div className="text-xs text-slate-400">
                        {challan.items?.length ?? 0} garments · {groups.length} rolls
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={onClose} className="px-4 py-2 text-sm font-bold text-slate-600 hover:text-slate-800 transition">
                            Cancel
                        </button>
                        <button
                            onClick={handleSubmit}
                            disabled={submitting}
                            className="flex items-center gap-1.5 px-5 py-2.5 text-sm font-black uppercase tracking-widest rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white transition disabled:opacity-50"
                        >
                            {submitting ? <Loader size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                            Confirm Receive
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

// ── QueueCard ──────────────────────────────────────────────────────────────────

const QueueCard = ({ item, onProcess }) => {
    const daysSince = item.sent_at
        ? Math.floor((Date.now() - new Date(item.sent_at).getTime()) / 86400000)
        : null;

    return (
        <div className="bg-white rounded-2xl border-2 border-amber-300 shadow-sm overflow-hidden">
            <div className="px-5 py-4">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-black text-slate-800 font-mono">{item.challan_number}</span>
                            <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 uppercase tracking-widest">
                                Active
                            </span>
                        </div>
                        <div className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-1">
                            {[
                                ['Product',  item.product_name],
                                ['Vendor',   item.vendor_name],
                                ['Line',     item.line_name],
                                ['Batch',    `#${item.production_batch_id} · ${item.batch_code}`],
                            ].map(([lbl, val]) => (
                                <div key={lbl}>
                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{lbl} </span>
                                    <span className="text-xs font-bold text-slate-600">{val}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="text-right shrink-0">
                        <div className="text-2xl font-black text-slate-800">{item.total_items}</div>
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">garments</div>
                        {daysSince !== null && (
                            <div className={`mt-1 text-[10px] font-bold ${daysSince > 2 ? 'text-rose-600' : 'text-slate-400'}`}>
                                {daysSince === 0 ? 'sent today' : `${daysSince}d ago`}
                            </div>
                        )}
                    </div>
                </div>

                {/* Partial progress bar */}
                {item.total_items > 0 && (item.approved + item.qc_rejected + item.repaired) > 0 && (
                    <div className="mt-3">
                        <div className="flex justify-between text-[10px] font-bold text-slate-400 mb-1">
                            <span>{item.approved + item.qc_rejected + item.repaired} / {item.total_items} received</span>
                            <span>{item.pending_items} pending</span>
                        </div>
                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-emerald-500 rounded-full transition-all"
                                style={{ width: `${Math.round(((item.total_items - item.pending_items) / item.total_items) * 100)}%` }}
                            />
                        </div>
                    </div>
                )}
            </div>

            <div className="px-5 pb-4">
                <button
                    onClick={() => onProcess(item)}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black uppercase tracking-widest text-sm transition"
                >
                    <PackageCheck size={15} /> Process Receive <ArrowRight size={14} />
                </button>
            </div>
        </div>
    );
};

// ── RecentRow ──────────────────────────────────────────────────────────────────

const RecentRow = ({ item }) => (
    <div className="flex items-center justify-between px-4 py-3 bg-white rounded-xl border border-slate-200">
        <div className="flex items-center gap-3 min-w-0">
            <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
            <div className="min-w-0">
                <div className="text-xs font-black text-slate-700 font-mono truncate">{item.challan_number}</div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                    {item.product_name} · {item.vendor_name}
                </div>
            </div>
        </div>
        <div className="flex items-center gap-3 shrink-0 ml-3">
            <div className="hidden sm:flex items-center gap-1.5 text-[10px] font-bold">
                <span className="text-emerald-600">{item.approved} ok</span>
                {item.qc_rejected > 0 && <span className="text-rose-600">{item.qc_rejected} rej.</span>}
                {item.repaired    > 0 && <span className="text-amber-600">{item.repaired} rep.</span>}
            </div>
            <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 uppercase tracking-widest">
                Done
            </span>
        </div>
    </div>
);

// ── ReceiverDashboardPage ──────────────────────────────────────────────────────

const ReceiverDashboardPage = () => {
    const [dashboard,      setDashboard]      = useState(null);
    const [activeChallan,  setActiveChallan]  = useState(null);
    const [grnResult,      setGrnResult]      = useState(null);
    const [isLoading,      setIsLoading]      = useState(true);
    const [error,          setError]          = useState('');
    const [showRecent,     setShowRecent]     = useState(false);

    const loadDashboard = useCallback(async () => {
        setIsLoading(true); setError('');
        try {
            const res = await jobWorkApi.getReceiverDashboard();
            setDashboard(res.data);
        } catch {
            setError('Failed to load dashboard.');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => { loadDashboard(); }, [loadDashboard]);

    // When user clicks "Process Receive" on a queue item, fetch the full challan detail
    const handleProcess = async (queueItem) => {
        try {
            const res = await jobWorkApi.getChallan(queueItem.id);
            setActiveChallan(res.data);
        } catch {
            alert('Failed to load challan details.');
        }
    };

    const handleReceived = (grn) => {
        setActiveChallan(null);
        setGrnResult(grn);
        loadDashboard();
    };

    const handleGrnDismiss = () => {
        setGrnResult(null);
    };

    const { queue = [], recent = [], summary = {} } = dashboard ?? {};

    return (
        <div className="min-h-screen bg-slate-50">
            {/* Page header */}
            <div className="bg-white border-b border-slate-200 px-5 py-4 flex items-center justify-between">
                <div>
                    <h1 className="text-lg font-black text-slate-800 tracking-tight">Receiving Queue</h1>
                    <p className="text-xs text-slate-400 mt-0.5">Process incoming goods from external job work vendors.</p>
                </div>
                <button
                    onClick={loadDashboard}
                    disabled={isLoading}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition disabled:opacity-50 bg-white"
                >
                    <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} /> Refresh
                </button>
            </div>

            <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
                {/* States */}
                {isLoading && (
                    <div className="flex items-center justify-center py-20 text-slate-400">
                        <Loader size={20} className="animate-spin mr-2" /> Loading…
                    </div>
                )}
                {!isLoading && error && (
                    <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                        <AlertCircle size={15} /> {error}
                    </div>
                )}

                {!isLoading && !error && (
                    <>
                        {/* Summary stats */}
                        <div className="grid grid-cols-3 gap-3">
                            {[
                                { label: 'Pending Challans', val: summary.pending_challans ?? 0, cls: 'bg-amber-50 border-amber-200 text-amber-800', vCls: 'text-amber-700' },
                                { label: 'Pending Garments', val: summary.pending_garments ?? 0, cls: 'bg-slate-50 border-slate-200 text-slate-600',  vCls: 'text-slate-800' },
                                { label: 'Received Today',   val: summary.received_today   ?? 0, cls: 'bg-emerald-50 border-emerald-200 text-emerald-700', vCls: 'text-emerald-700' },
                            ].map(({ label, val, cls, vCls }) => (
                                <div key={label} className={`rounded-2xl border p-4 text-center ${cls}`}>
                                    <div className={`text-3xl font-black ${vCls}`}>{val}</div>
                                    <div className="text-[10px] font-bold uppercase tracking-widest mt-1 opacity-70">{label}</div>
                                </div>
                            ))}
                        </div>

                        {/* Queue */}
                        {queue.length === 0 ? (
                            <div className="text-center py-16 bg-white rounded-2xl border-2 border-dashed border-slate-200 text-slate-400">
                                <PackageCheck size={36} className="mx-auto mb-2 opacity-30" />
                                <p className="font-bold text-sm">No challans pending.</p>
                                <p className="text-xs mt-1 text-slate-300">All job work goods have been received.</p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div className="flex items-center gap-2">
                                    <Truck size={14} className="text-amber-600" />
                                    <span className="text-xs font-black text-slate-600 uppercase tracking-widest">
                                        Queue — {queue.length} challan{queue.length > 1 ? 's' : ''} pending
                                    </span>
                                </div>
                                {queue.map(item => (
                                    <QueueCard key={item.id} item={item} onProcess={handleProcess} />
                                ))}
                            </div>
                        )}

                        {/* Recent (collapsible) */}
                        {recent.length > 0 && (
                            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                                <button
                                    onClick={() => setShowRecent(s => !s)}
                                    className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-slate-50 transition text-left"
                                >
                                    <div className="flex items-center gap-2">
                                        <Clock size={14} className="text-slate-400" />
                                        <span className="text-xs font-black text-slate-600 uppercase tracking-widest">
                                            Recently Received
                                        </span>
                                        <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
                                            {recent.length}
                                        </span>
                                    </div>
                                    {showRecent ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
                                </button>
                                {showRecent && (
                                    <div className="border-t border-slate-100 px-4 py-3 space-y-2">
                                        {recent.map(item => (
                                            <RecentRow key={item.id} item={item} />
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Receive modal */}
            {activeChallan && (
                <ReceiveModal
                    challan={activeChallan}
                    onClose={() => setActiveChallan(null)}
                    onReceived={handleReceived}
                />
            )}

            {/* GRN success banner */}
            {grnResult && (
                <GrnBanner grn={grnResult} onDismiss={handleGrnDismiss} />
            )}
        </div>
    );
};

export default ReceiverDashboardPage;

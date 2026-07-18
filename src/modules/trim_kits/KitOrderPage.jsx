import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { trimKitsApi } from '../../api/trimKitsApi';
import { useAuth } from '../../context/AuthContext';
import Modal from '../../shared/Modal';
import { kitStatusOf, kitBatchLabel } from './kitStatusConfig';
import { BatchTag, batchIdOf } from './BatchTag';
import ExchangePanel from './ExchangePanel';
import { recordPickedKit } from './pickedKitsHistory';
import { HandoverDetailModal } from './KitHistoryPage';
import { downloadIssueSlipPdf } from '../store_manager/issueSlipPdfGenerator';
import { getCompanyProfileOnce } from './handoverSlip';
import {
    Loader2, ArrowLeft, AlertCircle, AlertTriangle, CheckCircle2, ClipboardCheck,
    Replace, FileText, History, Download, PartyPopper, PackageX, RefreshCw, ArrowLeftRight,
    Minus, Plus, Search, ChevronDown, ChevronsDownUp, ChevronsUpDown, X
} from 'lucide-react';

const fmtDateTime = (d) => d ? new Date(d).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
const fmtMoney = (v) => `₹${parseFloat(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const variantLabel = (v) =>
    [`${v.color_number ? `${v.color_number} - ` : ''}${v.color_name || ''}`.trim(), v.variant_size]
        .filter(Boolean).join(' / ');

const _norm = (s) => String(s ?? '').trim().toLowerCase();

// Stable physical-trim key iff the item's WHOLE unissued fill is one substitute
// trim; otherwise null (mixed/partial/own-variant items never merge).
const substituteFillKey = (item) => {
    const active = (item.fulfilled_with || []).filter(fw => Number(fw.unissued_qty) > 0);
    if (active.length !== 1) return null;                    // 0 or multiple fills → don't merge
    const fw = active[0];
    if (!fw.is_substitute) return null;                      // own variant → don't merge
    if (Number(fw.unissued_qty) !== Number(item.unissued_qty)) return null; // partial → don't merge
    return ['sub', _norm(fw.item_name), _norm(fw.color_number), _norm(fw.color_name), _norm(fw.variant_size)].join('|');
};

// Regroup a name-group's items into render units: singles, plus merged clusters
// where 2+ originals were fully substituted with the SAME physical trim (one pile).
// A cluster sits at the position of its first constituent; a cluster of <2 demotes to a single.
const clustersOf = (items) => {
    const byKey = new Map();
    const units = [];
    items.forEach(it => {
        const k = substituteFillKey(it);
        if (!k) { units.push({ type: 'single', item: it }); return; }
        if (!byKey.has(k)) { const c = { type: 'merged', key: k, items: [] }; byKey.set(k, c); units.push(c); }
        byKey.get(k).items.push(it);
    });
    return units.map(u => (u.type === 'merged' && u.items.length < 2) ? { type: 'single', item: u.items[0] } : u);
};

// ── Result modal (MISMATCH / MATCHED / SIGNED) ───────────────────────────────
const VerifyResultModal = ({ result, onClose, onDownloadSlip, downloadingSlip }) => {
    if (!result) return null;

    if (result.kind === 'MISMATCH') {
        return (
            <Modal title="Count Mismatch" onClose={onClose}>
                <div className="p-4 bg-red-50 border border-red-200 rounded-xl mb-4 flex items-start gap-3">
                    <PackageX className="w-6 h-6 text-red-600 shrink-0" />
                    <p className="text-sm text-red-800 font-medium">
                        The kit did not match the checklist. It has gone back to the store to be corrected — they've been notified.
                        You're done for now; you'll get a notification when it's ready again.
                    </p>
                </div>
                <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
                    <thead className="bg-gray-50 text-xs uppercase text-gray-500 font-bold">
                        <tr>
                            <th className="px-4 py-2 text-left">Item</th>
                            <th className="px-4 py-2 text-left">Issue</th>
                            <th className="px-4 py-2 text-right">Expected</th>
                            <th className="px-4 py-2 text-right">Counted</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {(result.discrepancies || []).map((d, i) => (
                            <tr key={i}>
                                <td className="px-4 py-2 font-medium text-gray-800">{d.item_name}</td>
                                <td className="px-4 py-2">
                                    <span className="text-[10px] uppercase tracking-wider font-bold bg-red-100 text-red-700 px-2 py-0.5 rounded">
                                        {String(d.issue_kind || '').replace(/_/g, ' ')}
                                    </span>
                                </td>
                                <td className="px-4 py-2 text-right font-mono">{d.expected_qty}</td>
                                <td className="px-4 py-2 text-right font-mono font-bold">{d.counted_qty}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </Modal>
        );
    }

    if (result.kind === 'MATCHED_UNSIGNED') {
        return (
            <Modal title="Counts Match" onClose={onClose}>
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl flex items-start gap-3">
                    <CheckCircle2 className="w-6 h-6 text-blue-600 shrink-0" />
                    <p className="text-sm text-blue-800 font-medium">
                        Everything counted correctly, but custody was <strong>not</strong> taken. The kit stays with the store
                        until you (or another loader) sign for it.
                    </p>
                </div>
            </Modal>
        );
    }

    // SIGNED
    return (
        <Modal title="Custody Transferred" onClose={onClose}>
            <div className="p-5 bg-green-50 border border-green-200 rounded-xl mb-4 flex items-start gap-3">
                <PartyPopper className="w-7 h-7 text-green-600 shrink-0" />
                <div>
                    <p className="text-base text-green-900 font-bold">
                        Kit signed — issue slip <span className="font-mono">{result.issue?.issue_number}</span>
                    </p>
                    <p className="text-sm text-green-800 mt-1 font-medium">
                        Stock has been deducted and bill <span className="font-mono">{result.bill?.bill_number}</span> ({fmtMoney(result.bill?.total_amount)}) was created automatically.
                    </p>
                    {result.order_status === 'PARTIALLY_ISSUED' && (
                        <p className="text-sm text-purple-800 mt-2 font-bold bg-purple-50 border border-purple-200 rounded px-2 py-1 inline-block">
                            Partial handover — the remainder follows in a later kit.
                        </p>
                    )}
                </div>
            </div>
            {(result.warnings || []).length > 0 && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl mb-4 space-y-1">
                    {result.warnings.map((w, i) => (
                        <p key={i} className="text-xs text-amber-800 font-medium flex items-start">
                            <AlertTriangle className="w-3.5 h-3.5 mr-2 shrink-0 mt-0.5" /> {w}
                        </p>
                    ))}
                </div>
            )}
            <button
                onClick={onDownloadSlip}
                disabled={downloadingSlip}
                className="w-full flex items-center justify-center px-5 py-3 bg-gray-900 text-white rounded-lg font-bold hover:bg-black transition-colors disabled:opacity-50"
            >
                {downloadingSlip ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                Download Slip PDF ({result.issue?.issue_number})
            </button>
        </Modal>
    );
};

// ── Main page ────────────────────────────────────────────────────────────────
const KitOrderPage = () => {
    const { orderId } = useParams();
    const { user } = useAuth();

    const [kit, setKit] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [banner, setBanner] = useState(null); // blocking error banner {text}

    const [counts, setCounts] = useState({});   // { [itemId]: { counted_qty, issue_kind, notes } }
    const [sign, setSign] = useState(false);
    const [overallNotes, setOverallNotes] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [result, setResult] = useState(null);
    const [downloadingSlip, setDownloadingSlip] = useState(false);
    const [lastSignedLines, setLastSignedLines] = useState([]);

    const [activeTab, setActiveTab] = useState('checklist');
    const [verifications, setVerifications] = useState(null); // null = not loaded

    const [query, setQuery] = useState('');          // item search
    const [collapsed, setCollapsed] = useState({});  // { [trimName]: true } — accordion state
    const [expandedClusters, setExpandedClusters] = useState({}); // { [cid]: true } — merged rows opened for shortage
    const [missingOpen, setMissingOpen] = useState(false); // "still missing" panel — collapsed by default

    const fetchKit = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await trimKitsApi.getKitOrder(orderId);
            console.log('[trimkits] getKitOrder raw:', res.data);
            console.log('[trimkits] getKitOrder raw JSON:\n' + JSON.stringify(res.data, null, 2));
            setKit(res.data);
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to load kit.');
        } finally {
            setLoading(false);
        }
    }, [orderId]);

    useEffect(() => { fetchKit(); }, [fetchKit]);

    // Reset the count form whenever the kit payload changes (new cycle, correction, etc.)
    useEffect(() => {
        if (!kit) return;
        const next = {};
        (kit.items || []).forEach(it => {
            if (Number(it.unissued_qty) > 0) next[it.id] = { counted_qty: '', issue_kind: '', notes: '', mode: undefined };
        });
        setCounts(next);
        setSign(false);
        setExpandedClusters({});
    }, [kit]);

    const unissuedItems = useMemo(() => (kit?.items || []).filter(it => Number(it.unissued_qty) > 0), [kit]);
    // "Already handed over" = something was actually issued. An item never picked
    // (quantity_fulfilled 0) also has unissued_qty 0 — it belongs in "Still missing",
    // not here, so require quantity_fulfilled > 0 or it renders as a bogus "✓ 0".
    const issuedItems = useMemo(() => (kit?.items || []).filter(it => !(Number(it.unissued_qty) > 0) && Number(it.quantity_fulfilled) > 0), [kit]);

    // Batch-wide "still missing" — what's short across ALL kits of this batch, not just the current one:
    //  • per ordered item, required − fulfilled = qty never picked in any kit
    //  • plus items the store dismissed as unavailable (missing_items)
    const batchMissing = useMemo(() => {
        const rows = [];
        (kit?.items || []).forEach(it => {
            const short = (Number(it.quantity_required) || 0) - (Number(it.quantity_fulfilled) || 0);
            if (short > 0) rows.push({
                key: `short-${it.id}`,
                kind: 'short',
                item_name: it.item_name, item_code: it.item_code,
                color_name: it.color_name, color_number: it.color_number, variant_size: it.variant_size,
                qty: short,
            });
        });
        (kit?.missing_items || []).forEach((m, i) => rows.push({
            key: `dismissed-${m.id ?? i}`,
            kind: 'dismissed',
            item_name: m.item_name, item_code: m.item_code,
            color_name: m.color_name, color_number: m.color_number, variant_size: m.variant_size,
            qty: Number(m.quantity_required) || Number(m.missing_qty) || null,
        }));
        return rows;
    }, [kit]);

    // Group the count list by trim so all colours/sizes of one article sit together.
    const unissuedGroups = useMemo(() => {
        const order = [];
        const byName = new Map();
        unissuedItems.forEach(it => {
            const key = it.item_name || it.item_code || `#${it.id}`;
            if (!byName.has(key)) { byName.set(key, { name: it.item_name || 'Unnamed trim', item_code: it.item_code, items: [] }); order.push(key); }
            byName.get(key).items.push(it);
        });
        return order.map(k => byName.get(k));
    }, [unissuedItems]);

    // Default to collapsed groups — variants stay tucked inside their trim until the loader opens one.
    useEffect(() => {
        setCollapsed(Object.fromEntries(unissuedGroups.map(g => [g.name, true])));
    }, [unissuedGroups]);

    // Item search — match on trim name/code, or any variant's colour/size (keeps a whole group if its name hits).
    const filteredGroups = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return unissuedGroups;
        return unissuedGroups.map(g => {
            if (`${g.name} ${g.item_code || ''}`.toLowerCase().includes(q)) return g;
            const items = g.items.filter(it =>
                [it.item_name, it.item_code, it.color_name, it.color_number, it.variant_size]
                    .filter(Boolean).join(' ').toLowerCase().includes(q)
            );
            return items.length ? { ...g, items } : null;
        }).filter(Boolean);
    }, [unissuedGroups, query]);

    const allCollapsed = unissuedGroups.length > 0 && unissuedGroups.every(g => collapsed[g.name]);
    const toggleAll = () => setCollapsed(allCollapsed ? {} : Object.fromEntries(unissuedGroups.map(g => [g.name, true])));
    const toggleGroup = (name) => setCollapsed(prev => ({ ...prev, [name]: !prev[name] }));

    const canVerify = ['line_loader', 'factory_admin'].includes(user?.role) && kit?.status === 'READY_FOR_PICKUP';

    const isValidCount = (v) => v !== '' && Number.isInteger(Number(v)) && Number(v) >= 0;
    const allCounted = unissuedItems.length > 0 && unissuedItems.every(it => isValidCount(counts[it.id]?.counted_qty));

    const setCount = (id, patch) => setCounts(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }));

    // Nudge the counted qty up/down (used by the shortage stepper — handheld-friendly, no keyboard).
    const stepCount = (id, delta) => setCounts(prev => {
        const cur = prev[id] || {};
        const base = cur.counted_qty === '' || cur.counted_qty == null ? 0 : Number(cur.counted_qty);
        const next = Math.max(0, base + delta);
        return { ...prev, [id]: { ...cur, counted_qty: String(next) } };
    });

    // Bulk "all present" — mark each given item counted at its full expected qty (one tap for a whole group or the kit).
    const markItemsPresent = (list) => setCounts(prev => {
        const next = { ...prev };
        list.forEach(it => {
            next[it.id] = { ...next[it.id], mode: 'exact', counted_qty: String(Number(it.unissued_qty)), issue_kind: '', notes: '' };
        });
        return next;
    });
    const markAllPresent = () => markItemsPresent(unissuedItems);
    const markGroupPresent = (group) => markItemsPresent(group.items);
    const groupAllPresent = (group) => group.items.every(it => counts[it.id]?.mode === 'exact');

    // A merged-cluster id must be unique across the checklist — namespace by group name.
    const clusterId = (groupName, key) => `${groupName}::${key}`;

    // One count row for a single ordered trim variant (its own line = one trim_order_item).
    const renderCountRow = (item) => {
        const c = counts[item.id] || {};
        const counted = c.counted_qty;
        const countState = counted === '' || counted === undefined ? 'empty'
            : !isValidCount(counted) ? 'invalid'
            : Number(counted) === Number(item.unissued_qty) ? 'match' : 'diff';
        const borderTone = countState === 'match' ? 'border-l-green-400'
            : countState === 'diff' || countState === 'invalid' ? 'border-l-amber-400'
            : 'border-l-gray-200';
        const variant = [`${item.color_number ? `${item.color_number} - ` : ''}${item.color_name || ''}`.trim(), item.variant_size].filter(Boolean).join(' / ');
        return (
            <div key={item.id} className={`bg-white rounded-xl border border-gray-200 border-l-4 ${borderTone} shadow-sm p-4`}>
                <div className="flex flex-wrap justify-between items-start gap-4">
                    <div className="min-w-0 flex-1">
                        <p className="font-bold text-gray-900">
                            {variant || item.item_name}
                        </p>
                        {/* What was actually picked — check the physical trims against THESE variants */}
                        {(item.fulfilled_with || []).length > 0 && (
                            <div className="mt-2 space-y-1">
                                {item.fulfilled_with.filter(fw => Number(fw.unissued_qty) > 0).map((fw, i) => (
                                    <div key={i} className="flex items-center gap-2 text-xs bg-gray-50 border border-gray-200 rounded px-2 py-1">
                                        <span className="font-mono font-bold text-gray-700">{fw.unissued_qty}×</span>
                                        <span className="text-gray-700 font-medium truncate">{fw.item_name || item.item_name} — {variantLabel(fw)}</span>
                                        {fw.is_substitute && (
                                            <span className="inline-flex items-center text-[10px] uppercase tracking-wider font-bold bg-amber-100 text-amber-800 border border-amber-300 px-1.5 py-0.5 rounded">
                                                <Replace className="w-3 h-3 mr-1" /> Substitute
                                            </span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                    <div className="text-center shrink-0">
                        <p className="text-2xl font-black text-indigo-700">{Number(item.unissued_qty).toLocaleString('en-IN')}</p>
                        <p className="text-[10px] uppercase tracking-wider font-bold text-gray-400">Count this cycle</p>
                    </div>
                </div>

                {canVerify && (() => {
                    const expected = Number(item.unissued_qty);
                    const mode = c.mode; // 'exact' | 'diff' | undefined
                    const countedNum = counted === '' || counted == null ? 0 : Number(counted);
                    return (
                        <div className="mt-3 pt-3 border-t border-gray-100">
                            {/* One-tap: everything present, or flag a shortage / issue */}
                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    type="button"
                                    onClick={() => setCount(item.id, { mode: 'exact', counted_qty: String(expected), issue_kind: '', notes: '' })}
                                    className={`flex items-center justify-center gap-2 rounded-xl py-4 font-bold text-base border-2 transition-all active:scale-[0.98] ${
                                        mode === 'exact'
                                            ? 'border-green-500 bg-green-50 text-green-800 shadow-sm'
                                            : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                                    }`}
                                >
                                    <CheckCircle2 className="w-5 h-5" /> All {expected} present
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setCount(item.id, { mode: 'diff', counted_qty: mode === 'diff' ? (counted ?? '') : String(Math.max(expected - 1, 0)) })}
                                    className={`flex items-center justify-center gap-2 rounded-xl py-4 font-bold text-base border-2 transition-all active:scale-[0.98] ${
                                        mode === 'diff'
                                            ? 'border-amber-500 bg-amber-50 text-amber-800 shadow-sm'
                                            : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                                    }`}
                                >
                                    <AlertTriangle className="w-5 h-5" /> Shortage / issue
                                </button>
                            </div>

                            {mode === 'diff' && (
                                <div className="mt-3 space-y-3">
                                    {/* Big +/- stepper — no keyboard needed on a handheld */}
                                    <div className="flex items-center justify-between bg-amber-50/60 border border-amber-200 rounded-xl p-2">
                                        <span className="text-sm font-bold text-amber-800 pl-2">Counted on hand</span>
                                        <div className="flex items-center gap-2">
                                            <button
                                                type="button"
                                                onClick={() => stepCount(item.id, -1)}
                                                disabled={countedNum <= 0}
                                                className="w-12 h-12 rounded-lg bg-white border-2 border-amber-300 text-amber-700 flex items-center justify-center active:scale-95 disabled:opacity-40"
                                                aria-label="Decrease counted quantity"
                                            >
                                                <Minus className="w-5 h-5" />
                                            </button>
                                            <span className="w-16 text-center text-2xl font-black text-amber-900 tabular-nums">{countedNum}</span>
                                            <button
                                                type="button"
                                                onClick={() => stepCount(item.id, 1)}
                                                className="w-12 h-12 rounded-lg bg-white border-2 border-amber-300 text-amber-700 flex items-center justify-center active:scale-95"
                                                aria-label="Increase counted quantity"
                                            >
                                                <Plus className="w-5 h-5" />
                                            </button>
                                        </div>
                                    </div>
                                    <p className="text-xs font-bold text-center text-amber-700">
                                        {countedNum < expected ? `${expected - countedNum} short of ${expected} expected`
                                            : countedNum > expected ? `${countedNum - expected} over ${expected} expected`
                                            : `Matches expected ${expected}`}
                                    </p>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <div>
                                            <label className="text-[10px] uppercase tracking-wider font-bold text-gray-400">Problem (optional)</label>
                                            <select
                                                value={c.issue_kind || ''}
                                                onChange={e => setCount(item.id, { issue_kind: e.target.value })}
                                                className="mt-1 w-full border border-gray-300 rounded-lg p-2.5 text-sm bg-white outline-none focus:ring-2 focus:ring-indigo-500"
                                            >
                                                <option value="">No problem</option>
                                                <option value="WRONG_ITEM">Wrong item</option>
                                                <option value="DAMAGED">Damaged</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="text-[10px] uppercase tracking-wider font-bold text-gray-400">Notes (optional)</label>
                                            <input
                                                type="text"
                                                value={c.notes || ''}
                                                onChange={e => setCount(item.id, { notes: e.target.value })}
                                                placeholder="e.g. 2 pieces torn"
                                                className="mt-1 w-full border border-gray-300 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })()}
            </div>
        );
    };

    // One merged row standing in for a cluster of ordered variants all substituted with the
    // SAME physical trim (one pile). "All present" fans out to per-item exact counts; "Shortage"
    // expands the cluster into its real rows so each order line gets its own qty/issue/notes.
    const renderMergedRow = (group, unit, cid) => {
        const fw0 = unit.items[0].fulfilled_with.find(f => Number(f.unissued_qty) > 0);
        const total = unit.items.reduce((s, it) => s + Number(it.unissued_qty), 0);
        const allExact = unit.items.every(it => counts[it.id]?.mode === 'exact');
        const anyCounted = unit.items.some(it => isValidCount(counts[it.id]?.counted_qty));
        const tone = allExact ? 'border-l-green-400' : anyCounted ? 'border-l-amber-400' : 'border-l-gray-200';
        return (
            <div key={cid} className={`bg-white rounded-xl border border-gray-200 border-l-4 ${tone} shadow-sm p-4`}>
                <div className="flex flex-wrap justify-between items-start gap-4">
                    <div className="min-w-0 flex-1">
                        <p className="font-bold text-gray-900 flex items-center gap-2 flex-wrap">
                            {fw0.item_name || group.name} — {variantLabel(fw0)}
                            <span className="inline-flex items-center text-[10px] uppercase tracking-wider font-bold bg-amber-100 text-amber-800 border border-amber-300 px-1.5 py-0.5 rounded">
                                <Replace className="w-3 h-3 mr-1" /> Substitute
                            </span>
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                            One pile — covers {unit.items.length} ordered variants ({unit.items.map(it => variantLabel(it) || it.item_name).join(', ')})
                        </p>
                    </div>
                    <div className="text-center shrink-0">
                        <p className="text-2xl font-black text-indigo-700">{total.toLocaleString('en-IN')}</p>
                        <p className="text-[10px] uppercase tracking-wider font-bold text-gray-400">Count this cycle</p>
                    </div>
                </div>
                {canVerify && (
                    <div className="mt-3 pt-3 border-t border-gray-100 grid grid-cols-2 gap-2">
                        <button
                            type="button"
                            onClick={() => markItemsPresent(unit.items)}
                            className={`flex items-center justify-center gap-2 rounded-xl py-4 font-bold text-base border-2 transition-all active:scale-[0.98] ${
                                allExact
                                    ? 'border-green-500 bg-green-50 text-green-800 shadow-sm'
                                    : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                            }`}
                        >
                            <CheckCircle2 className="w-5 h-5" /> All {total} present
                        </button>
                        <button
                            type="button"
                            onClick={() => setExpandedClusters(p => ({ ...p, [cid]: true }))}
                            className="flex items-center justify-center gap-2 rounded-xl py-4 font-bold text-base border-2 transition-all active:scale-[0.98] border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                        >
                            <AlertTriangle className="w-5 h-5" /> Shortage / issue
                        </button>
                    </div>
                )}
            </div>
        );
    };

    const loadVerifications = useCallback(async () => {
        try {
            const res = await trimKitsApi.getVerifications(orderId);
            setVerifications(res.data || []);
        } catch (err) {
            setVerifications([]);
        }
    }, [orderId]);

    useEffect(() => {
        if (activeTab === 'verifications' && verifications === null) loadVerifications();
    }, [activeTab, verifications, loadVerifications]);

    const handleSubmit = async () => {
        if (!allCounted) return;
        if (sign && !window.confirm('Sign for this kit? You take custody of the counted items and stock is deducted — this cannot be undone.')) return;
        setSubmitting(true);
        setBanner(null);
        try {
            // The server requires exactly the items with unissued_qty > 0 — no more, no fewer.
            const items = unissuedItems.map(it => {
                const c = counts[it.id];
                const row = { trim_order_item_id: it.id, counted_qty: Number(c.counted_qty) };
                if (c.issue_kind) row.issue_kind = c.issue_kind;
                if (c.notes?.trim()) row.notes = c.notes.trim();
                return row;
            });
            // Snapshot what physically goes out this cycle — used for the slip PDF after signing.
            setLastSignedLines(unissuedItems.flatMap(it =>
                (it.fulfilled_with || []).filter(fw => Number(fw.unissued_qty) > 0).map(fw => ({
                    item_kind: 'trim',
                    item_name: fw.item_name || it.item_name,
                    item_code: it.item_code,
                    variant_color_name: fw.color_name,
                    variant_color_number: fw.color_number,
                    variant_size: fw.variant_size,
                    qty: fw.unissued_qty,
                    unit_cost: fw.unit_cost ?? fw.selling_price ?? it.unit_cost ?? it.selling_price ?? it.unit_price,
                }))
            ));
            const res = await trimKitsApi.verifyKit(orderId, {
                items,
                sign,
                ...(overallNotes.trim() ? { notes: overallNotes.trim() } : {}),
            });
            const data = res.data || {};
            console.log('[trimkits] verifyKit raw:', data);
            console.log('[trimkits] verifyKit raw JSON:\n' + JSON.stringify(data, null, 2));
            if (data.result === 'MISMATCH') {
                setResult({ kind: 'MISMATCH', discrepancies: data.discrepancies, order_status: data.order_status });
            } else if (data.signed) {
                setResult({ kind: 'SIGNED', ...data });
                // Remember this pickup on-device so the loader keeps a recent list of their own
                // handovers without paging the register. issue_id is what the slip PDF downloads by.
                recordPickedKit({
                    orderId,
                    batchLabel: kitBatchLabel(kit),
                    batch_code: kit.batch_code,
                    production_batch_id: batchIdOf(kit),
                    issue_id: data.issue?.id,
                    issue_number: data.issue?.issue_number,
                    total_value: data.issue?.total_value,
                    order_status: data.order_status,
                    signed_at: new Date().toISOString(),
                });
            } else {
                setResult({ kind: 'MATCHED_UNSIGNED' });
            }
            await fetchKit();
        } catch (err) {
            const d = err.response?.data || {};
            if (d.available !== undefined && d.needed !== undefined) {
                setBanner({ text: `Stock shortfall: available ${d.available}, needed ${d.needed} — the kit goes back to the store to correct. ${d.error || ''}` });
            } else {
                setBanner({ text: d.error || 'Verification failed. Please try again.' });
            }
            if (err.response?.status === 409) await fetchKit();
        } finally {
            setSubmitting(false);
        }
    };

    const handleDownloadSlip = async () => {
        if (!result?.issue) return;
        setDownloadingSlip(true);
        try {
            const company = await getCompanyProfileOnce();
            await downloadIssueSlipPdf({
                company,
                issue: {
                    id: result.issue.id,
                    issue_number: result.issue.issue_number,
                    created_at: new Date().toISOString(),
                    batch_label: kitBatchLabel(kit),
                    issued_to_name: user?.name || 'Line Loader',
                    issued_to_department: kit?.delivery_line_name ? `Production line: ${kit.delivery_line_name}` : undefined,
                    issued_by_name: kit?.kit_ready_by_name,
                    total_value: result.issue.total_value,
                    notes: overallNotes.trim() || undefined,
                    lines: lastSignedLines,
                },
            });
        } finally {
            setDownloadingSlip(false);
        }
    };

    // Past handover slips open a shared detail modal (real lines at cost + loss cases + PDF).
    const [slipDetailId, setSlipDetailId] = useState(null);

    // ── Render ───────────────────────────────────────────────────────────────
    if (loading) return <div className="flex justify-center p-16"><Loader2 className="animate-spin h-10 w-10 text-indigo-600" /></div>;
    if (error) return (
        <div className="max-w-3xl mx-auto p-6 bg-red-50 text-red-700 rounded-xl border border-red-200 flex items-center justify-between">
            <span className="flex items-center font-medium"><AlertCircle className="h-5 w-5 mr-3" /> {error}</span>
            <button onClick={fetchKit} className="text-sm font-bold underline">Retry</button>
        </div>
    );
    if (!kit) return null;

    const statusMeta = kitStatusOf(kit.status);
    const lv = kit.latest_verification;
    const slips = kit.slips || [];

    const TABS = [
        { key: 'checklist', label: 'Checklist', icon: ClipboardCheck },
        { key: 'exchanges', label: 'Exchanges', icon: ArrowLeftRight },
        { key: 'handovers', label: `Previous handovers${slips.length ? ` (${slips.length})` : ''}`, icon: FileText },
        { key: 'verifications', label: 'Verification history', icon: History },
    ];

    return (
        <div className="max-w-4xl mx-auto pb-32">
            <div className="flex items-center justify-between mb-4">
                <Link to="/line-loader/trim-kits" className="text-sm text-indigo-600 hover:underline flex items-center font-semibold">
                    <ArrowLeft className="w-4 h-4 mr-2" /> Back to Pickup Queue
                </Link>
                <button onClick={fetchKit} className="p-2 bg-white border border-gray-300 rounded-lg shadow-sm hover:bg-gray-50 text-gray-600" title="Refresh">
                    <RefreshCw className="h-4 w-4" />
                </button>
            </div>

            {/* Header */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 mb-4">
                <div className="flex flex-wrap justify-between items-start gap-3">
                    <div>
                        <div className="flex items-center gap-3">
                            <h1 className="text-2xl font-extrabold text-gray-900 inline-flex items-center gap-2">Kit — Batch <BatchTag code={kit.batch_code} id={batchIdOf(kit)} /></h1>
                            <span className={`px-3 py-1 text-xs font-bold uppercase tracking-wider rounded-full border ${statusMeta.badge}`}>
                                {statusMeta.label}
                            </span>
                        </div>
                        <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2 text-sm text-gray-500 font-medium">
                            {kit.delivery_line_name && <span>Deliver to: <span className="font-bold text-gray-800">{kit.delivery_line_name}</span></span>}
                            {kit.kit_ready_at && <span>Ready {fmtDateTime(kit.kit_ready_at)}{kit.kit_ready_by_name && <> by <span className="font-semibold text-gray-700">{kit.kit_ready_by_name}</span></>}</span>}
                            {kit.signed_at && <span>Last signed {fmtDateTime(kit.signed_at)}{kit.signed_by_name && <> by <span className="font-semibold text-gray-700">{kit.signed_by_name}</span></>}</span>}
                        </div>
                    </div>
                    {kit.issue_number && (
                        <div className="text-right">
                            <p className="text-[10px] uppercase tracking-wider font-bold text-gray-400">Latest slip</p>
                            <p className="font-mono font-bold text-gray-800">{kit.issue_number}</p>
                        </div>
                    )}
                </div>
                {lv && lv.result === 'MISMATCH' && (
                    <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                        <p className="text-xs text-red-800 font-medium">
                            Last verification by <strong>{lv.verified_by_name}</strong> ({fmtDateTime(lv.created_at)}) found a mismatch — the store is correcting the kit.
                            {lv.notes && <> Notes: “{lv.notes}”</>}
                        </p>
                    </div>
                )}
            </div>

            {banner && (
                <div className="p-4 mb-4 bg-red-50 text-red-800 rounded-xl border-2 border-red-300 flex items-start text-sm font-bold">
                    <AlertCircle className="h-5 w-5 mr-3 shrink-0" /> {banner.text}
                </div>
            )}

            {/* Tabs */}
            <div className="flex gap-1 mb-4 bg-white border border-gray-200 rounded-xl p-1 shadow-sm">
                {TABS.map(t => (
                    <button
                        key={t.key}
                        onClick={() => setActiveTab(t.key)}
                        className={`flex-1 flex items-center justify-center px-4 py-2.5 text-sm font-bold rounded-lg transition-colors ${activeTab === t.key ? 'bg-indigo-600 text-white shadow' : 'text-gray-600 hover:bg-gray-100'}`}
                    >
                        <t.icon className="w-4 h-4 mr-2" /> {t.label}
                    </button>
                ))}
            </div>

            {/* ── CHECKLIST TAB ── */}
            {activeTab === 'checklist' && (
                <div className="space-y-4">
                    {batchMissing.length > 0 && (
                        <div className="bg-amber-50 border border-amber-200 rounded-xl">
                            <button
                                type="button"
                                onClick={() => setMissingOpen(o => !o)}
                                className="w-full flex items-center justify-between gap-2 p-4"
                            >
                                <span className="flex items-center gap-2 min-w-0">
                                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                                    <span className="text-xs font-bold uppercase tracking-wider text-amber-700 text-left">Still missing for this batch — not supplied in any kit</span>
                                    <span className="text-[10px] font-bold text-amber-700 bg-amber-100 border border-amber-200 rounded-full px-2 py-0.5 shrink-0">{batchMissing.length}</span>
                                </span>
                                <ChevronDown className={`w-4 h-4 text-amber-600 shrink-0 transition-transform ${missingOpen ? '' : '-rotate-90'}`} />
                            </button>
                            {missingOpen && (
                            <ul className="space-y-1 px-4 pb-4">
                                {batchMissing.map(m => {
                                    const variant = [`${m.color_number ? `${m.color_number} - ` : ''}${m.color_name || ''}`.trim(), m.variant_size].filter(Boolean).join(' / ');
                                    return (
                                        <li key={m.key} className="flex items-center justify-between text-sm bg-white border border-amber-100 rounded px-3 py-1.5">
                                            <span className="text-gray-700 truncate">
                                                {m.qty != null && <span className="font-mono font-bold text-amber-800 mr-1.5">{Number(m.qty).toLocaleString('en-IN')}×</span>}
                                                <span className="font-semibold">{m.item_name}</span>{variant ? ` — ${variant}` : ''}
                                            </span>
                                            <span className={`text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded shrink-0 ml-2 ${m.kind === 'dismissed' ? 'bg-gray-100 text-gray-600' : 'bg-amber-100 text-amber-700'}`}>
                                                {m.kind === 'dismissed' ? 'unavailable' : 'not yet picked'}
                                            </span>
                                        </li>
                                    );
                                })}
                            </ul>
                            )}
                        </div>
                    )}

                    {unissuedItems.length === 0 ? (
                        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-12 text-center">
                            <CheckCircle2 className="w-12 h-12 text-green-400 mx-auto mb-3" />
                            <p className="text-gray-700 font-bold">Nothing left to count — this kit has been fully handed over.</p>
                        </div>
                    ) : (
                        <>
                        {/* Search + collapse-all toolbar */}
                        <div className="flex items-center gap-2">
                            <div className="relative flex-1">
                                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                                <input
                                    type="text"
                                    value={query}
                                    onChange={e => setQuery(e.target.value)}
                                    placeholder="Search items — name, code, colour, size…"
                                    className="w-full border border-gray-300 rounded-lg pl-9 pr-9 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                                />
                                {query && (
                                    <button type="button" onClick={() => setQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600" aria-label="Clear search">
                                        <X className="w-4 h-4" />
                                    </button>
                                )}
                            </div>
                            {canVerify && (
                                <button
                                    type="button"
                                    onClick={markAllPresent}
                                    className="flex items-center gap-1.5 px-3 py-2.5 text-sm font-bold text-green-700 bg-green-50 border border-green-300 rounded-lg hover:bg-green-100 whitespace-nowrap"
                                    title="Mark every item counted at its full expected quantity"
                                >
                                    <CheckCircle2 className="w-4 h-4" /> All present
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={toggleAll}
                                className="flex items-center gap-1.5 px-3 py-2.5 text-sm font-bold text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 whitespace-nowrap"
                            >
                                {allCollapsed ? <ChevronsUpDown className="w-4 h-4" /> : <ChevronsDownUp className="w-4 h-4" />}
                                {allCollapsed ? 'Expand all' : 'Collapse all'}
                            </button>
                        </div>

                        {filteredGroups.length === 0 ? (
                            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-10 text-center text-gray-500 font-medium">
                                No items match “{query}”.
                            </div>
                        ) : (
                        filteredGroups.map(group => {
                          const isCollapsed = !query && collapsed[group.name];
                          const groupDone = group.items.filter(it => isValidCount(counts[it.id]?.counted_qty)).length;
                          return (
                          <div key={group.name} className="space-y-3">
                            {/* Accordion header — tap the title to collapse/expand this trim's variants */}
                            <div className="w-full flex items-center justify-between gap-2 px-1 py-1">
                                <button
                                    type="button"
                                    onClick={() => toggleGroup(group.name)}
                                    className="flex items-center gap-2 min-w-0 flex-1 text-left"
                                >
                                    <ChevronDown className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${isCollapsed ? '-rotate-90' : ''}`} />
                                    <h3 className="text-base font-extrabold text-gray-900 truncate">{group.name}</h3>
                                    {group.item_code && <span className="text-xs font-mono text-gray-400 shrink-0">({group.item_code})</span>}
                                    {group.items.length > 1 && (
                                        <span className="text-[10px] uppercase tracking-wider font-bold text-gray-500 bg-gray-100 border border-gray-200 rounded-full px-2 py-0.5 shrink-0">
                                            {group.items.length} variants
                                        </span>
                                    )}
                                </button>
                                {canVerify && (
                                    <div className="flex items-center gap-3 shrink-0">
                                        <span className={`text-xs font-bold whitespace-nowrap ${groupDone === group.items.length ? 'text-green-600' : 'text-gray-400'}`}>
                                            {groupDone}/{group.items.length} counted
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => markGroupPresent(group)}
                                            className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold rounded-lg border whitespace-nowrap transition-colors ${
                                                groupAllPresent(group)
                                                    ? 'text-green-700 bg-green-50 border-green-300'
                                                    : 'text-gray-600 bg-white border-gray-300 hover:bg-gray-50'
                                            }`}
                                            title={group.items.length > 1 ? 'Mark all variants of this trim present' : 'Mark this item present'}
                                        >
                                            <CheckCircle2 className="w-3.5 h-3.5" /> All present
                                        </button>
                                    </div>
                                )}
                            </div>
                            {!isCollapsed && clustersOf(group.items).map(unit => {
                                if (unit.type === 'single') return renderCountRow(unit.item);
                                const cid = clusterId(group.name, unit.key);
                                if (expandedClusters[cid]) {
                                    // Shortage path — show the real per-line rows so each order line
                                    // gets its own counted qty / issue / notes.
                                    return (
                                        <div key={cid} className="space-y-3">
                                            <button
                                                type="button"
                                                onClick={() => setExpandedClusters(p => { const n = { ...p }; delete n[cid]; return n; })}
                                                className="text-xs font-bold text-indigo-600 hover:underline flex items-center gap-1 px-1"
                                            >
                                                <ChevronsDownUp className="w-3.5 h-3.5" /> Count these {unit.items.length} together again
                                            </button>
                                            {unit.items.map(renderCountRow)}
                                        </div>
                                    );
                                }
                                return renderMergedRow(group, unit, cid);
                            })}
                          </div>
                          );
                        })
                        )}
                        </>
                    )}

                    {issuedItems.length > 0 && (
                        <details className="bg-gray-50 border border-gray-200 rounded-xl">
                            <summary className="px-4 py-3 cursor-pointer text-xs font-bold uppercase tracking-wider text-gray-500 hover:text-gray-700">
                                Already handed over ({issuedItems.length})
                            </summary>
                            <div className="px-4 pb-3 space-y-1">
                                {issuedItems.map(item => (
                                    <div key={item.id} className="flex justify-between text-sm text-gray-600 bg-white border border-gray-200 rounded px-3 py-2">
                                        <span className="font-medium truncate">
                                            {item.item_name} — {[`${item.color_number ? `${item.color_number} - ` : ''}${item.color_name || ''}`.trim(), item.variant_size].filter(Boolean).join(' / ')}
                                        </span>
                                        <span className="font-mono text-green-700 font-bold whitespace-nowrap ml-3">✓ {item.quantity_fulfilled}</span>
                                    </div>
                                ))}
                            </div>
                        </details>
                    )}
                </div>
            )}

            {/* ── EXCHANGES TAB ── */}
            {activeTab === 'exchanges' && (
                <ExchangePanel orderId={orderId} onChanged={fetchKit} />
            )}

            {/* ── HANDOVERS TAB ── */}
            {activeTab === 'handovers' && (
                <div className="space-y-2">
                    {slips.length === 0 ? (
                        <p className="bg-white rounded-xl border border-gray-200 shadow-sm p-10 text-center text-gray-400 font-medium">No handovers yet — this kit has not been signed for.</p>
                    ) : (
                        slips.map(s => (
                            <button
                                key={s.id}
                                onClick={() => setSlipDetailId(s.id)}
                                className="w-full flex items-center justify-between gap-4 bg-white rounded-xl border border-gray-200 shadow-sm hover:border-indigo-300 transition-all px-4 py-3 text-left"
                            >
                                <div className="min-w-0">
                                    <p className="font-mono font-bold text-gray-800">{s.issue_number}</p>
                                    <p className="text-xs text-gray-500 mt-0.5">
                                        {fmtDateTime(s.created_at)}{s.issued_to_name ? ` · ${s.issued_to_name}` : ''}
                                    </p>
                                </div>
                                <div className="flex items-center gap-3 shrink-0">
                                    <div className="text-right">
                                        <p className="font-mono font-bold text-gray-800">{fmtMoney(s.total_value)}</p>
                                        {s.bill_number && <p className="text-[11px] text-gray-400">{s.bill_number}</p>}
                                    </div>
                                    <span className="flex items-center gap-1 text-xs font-bold text-indigo-600"><Download className="w-4 h-4" /> Detail</span>
                                </div>
                            </button>
                        ))
                    )}
                    {slipDetailId && <HandoverDetailModal issueId={slipDetailId} onClose={() => setSlipDetailId(null)} />}
                </div>
            )}

            {/* ── VERIFICATIONS TAB ── */}
            {activeTab === 'verifications' && (
                <div className="space-y-3">
                    {verifications === null ? (
                        <div className="flex justify-center p-10"><Loader2 className="animate-spin h-7 w-7 text-indigo-600" /></div>
                    ) : verifications.length === 0 ? (
                        <p className="bg-white rounded-xl border border-gray-200 shadow-sm p-10 text-center text-gray-400 font-medium">No verifications recorded yet.</p>
                    ) : (
                        verifications.map((v, i) => {
                            const badge = v.result === 'MISMATCH'
                                ? 'bg-red-100 text-red-700 border-red-200'
                                : 'bg-green-100 text-green-700 border-green-200';
                            return (
                                <div key={v.id || i} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                                    <div className="flex flex-wrap justify-between items-center gap-2 mb-2">
                                        <div className="flex items-center gap-2">
                                            <span className={`px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full border ${badge}`}>
                                                {v.result}{v.signed ? ' · signed' : ''}
                                            </span>
                                            <span className="text-sm font-semibold text-gray-700">{v.verified_by_name}</span>
                                        </div>
                                        <span className="text-xs text-gray-400 font-medium">{fmtDateTime(v.created_at)}</span>
                                    </div>
                                    {v.notes && <p className="text-xs text-gray-500 italic mb-2">“{v.notes}”</p>}
                                    {(v.items || []).length > 0 && (
                                        <div className="space-y-1">
                                            {v.items.map((it, j) => (
                                                <div key={j} className={`flex justify-between items-center text-xs rounded px-2.5 py-1.5 ${it.issue_kind ? 'bg-red-50 border border-red-100' : 'bg-gray-50 border border-gray-100'}`}>
                                                    <span className="font-medium text-gray-700 truncate">{it.item_name}</span>
                                                    <span className="font-mono whitespace-nowrap ml-3">
                                                        {it.counted_qty} / {it.expected_qty}
                                                        {it.issue_kind && <span className="ml-2 text-[10px] uppercase font-bold text-red-600">{String(it.issue_kind).replace(/_/g, ' ')}</span>}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>
            )}

            {/* ── STICKY SIGN BAR ── */}
            {canVerify && activeTab === 'checklist' && unissuedItems.length > 0 && (
                <div className="fixed bottom-0 left-0 right-0 bg-white border-t-2 border-indigo-100 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] z-40">
                    <div className="max-w-4xl mx-auto px-6 py-3 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                        <input
                            type="text"
                            value={overallNotes}
                            onChange={e => setOverallNotes(e.target.value)}
                            placeholder="Overall note (optional)"
                            className="flex-1 border border-gray-300 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                        <label className="flex items-center gap-2 text-sm font-bold text-gray-800 whitespace-nowrap cursor-pointer select-none bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2.5">
                            <input
                                type="checkbox"
                                checked={sign}
                                onChange={e => setSign(e.target.checked)}
                                className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                            />
                            I take custody of this kit
                        </label>
                        <button
                            onClick={handleSubmit}
                            disabled={!allCounted || submitting}
                            title={allCounted ? '' : 'Mark every item — "All present" or "Shortage / issue"'}
                            className="flex items-center justify-center px-6 py-2.5 bg-indigo-600 text-white rounded-lg shadow-md hover:bg-indigo-700 font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                        >
                            {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ClipboardCheck className="w-4 h-4 mr-2" />}
                            {sign ? 'Verify & Sign' : 'Verify Counts'}
                        </button>
                    </div>
                </div>
            )}

            <VerifyResultModal
                result={result}
                onClose={() => setResult(null)}
                onDownloadSlip={handleDownloadSlip}
                downloadingSlip={downloadingSlip}
            />
        </div>
    );
};

export default KitOrderPage;

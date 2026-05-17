import { useState, useEffect, useMemo, useCallback } from 'react';
import {
    Loader2, BookOpen, Filter, ChevronLeft, ChevronRight,
    AlertTriangle, TrendingUp, TrendingDown, Search,
} from 'lucide-react';
import { trimsApi } from '../../api/trimsApi';

// ── Source kind styling ──────────────────────────────────────────────────────
const SOURCE_CFG = {
    inward_create:      { cls: 'bg-emerald-100 text-emerald-700 border-emerald-200', label: 'Inward' },
    auto_fulfill_exact: { cls: 'bg-blue-100 text-blue-700 border-blue-200',           label: 'Auto fulfill' },
    fulfill_revert:     { cls: 'bg-amber-100 text-amber-700 border-amber-200',        label: 'Fulfill revert' },
    manual:             { cls: 'bg-violet-100 text-violet-700 border-violet-200',     label: 'Manual' },
    inward_revert:      { cls: 'bg-rose-100 text-rose-700 border-rose-200',           label: 'Inward revert' },
};
const sourceCfg = (kind) => SOURCE_CFG[kind] || { cls: 'bg-slate-100 text-slate-600 border-slate-200', label: kind || '—' };

// Common source_kind values the buyer is likely to filter by. The dropdown also
// auto-extends with any unknown kinds that appear in the loaded ledger rows.
const KNOWN_KINDS = ['inward_create', 'auto_fulfill_exact', 'fulfill_revert', 'manual', 'inward_revert'];

const fmtDate = (d) => d
    ? new Date(d).toLocaleString('en', { dateStyle: 'medium', timeStyle: 'short' })
    : '—';
const fmtSigned = (n) => {
    const v = Number(n || 0);
    if (v > 0) return `+${v.toLocaleString()}`;
    return v.toLocaleString();
};

const PAGE_SIZE = 100;

export default function TrimsLedgerPage() {
    // ── Trim item + variant pickers ─────────────────────────────────────────
    const [trimItems, setTrimItems] = useState([]);
    const [trimItemsLoading, setTrimItemsLoading] = useState(true);
    const [selectedItemId, setSelectedItemId] = useState('');
    const [itemSearch, setItemSearch] = useState('');

    const [variants, setVariants] = useState([]);
    const [variantsLoading, setVariantsLoading] = useState(false);
    const [selectedVariantId, setSelectedVariantId] = useState('');

    // ── Filters / pagination ────────────────────────────────────────────────
    const [sourceKind, setSourceKind] = useState('');
    const [offset, setOffset] = useState(0);

    // ── Ledger state ────────────────────────────────────────────────────────
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState(null);

    // Load all trim items once
    useEffect(() => {
        setTrimItemsLoading(true);
        trimsApi.getItems()
            .then(r => setTrimItems(r.data?.data ?? r.data ?? []))
            .catch(() => setTrimItems([]))
            .finally(() => setTrimItemsLoading(false));
    }, []);

    // Whenever the trim item changes, load its variants (so user can drill down)
    useEffect(() => {
        if (!selectedItemId) { setVariants([]); setSelectedVariantId(''); return; }
        setVariantsLoading(true);
        trimsApi.getVariants(selectedItemId)
            .then(r => setVariants(r.data?.data ?? r.data ?? []))
            .catch(() => setVariants([]))
            .finally(() => setVariantsLoading(false));
        setSelectedVariantId('');     // drop variant selection when item changes
        setOffset(0);                 // reset pagination
    }, [selectedItemId]);

    // Reset pagination on filter/scope change
    useEffect(() => { setOffset(0); }, [selectedVariantId, sourceKind]);

    // ── Fetch ledger ────────────────────────────────────────────────────────
    const fetchLedger = useCallback(async () => {
        if (!selectedItemId) { setRows([]); return; }
        setLoading(true); setErr(null);
        try {
            const params = { limit: PAGE_SIZE, offset };
            if (sourceKind) params.source_kind = sourceKind;
            const r = selectedVariantId
                ? await trimsApi.getVariantStockLedger(selectedVariantId, params)
                : await trimsApi.getItemStockLedger(selectedItemId, params);
            setRows(r.data?.data ?? r.data ?? []);
        } catch (e) {
            setErr(e?.response?.data?.error || e.message || 'Failed to load ledger.');
            setRows([]);
        } finally {
            setLoading(false);
        }
    }, [selectedItemId, selectedVariantId, sourceKind, offset]);

    useEffect(() => { fetchLedger(); }, [fetchLedger]);

    // Auto-extend the source-kind filter options with any unknown kinds in data.
    const sourceKindOptions = useMemo(() => {
        const seen = new Set(KNOWN_KINDS);
        rows.forEach(r => { if (r.source_kind) seen.add(r.source_kind); });
        return [...seen];
    }, [rows]);

    // Trim-item dropdown search
    const filteredTrimItems = useMemo(() => {
        const q = itemSearch.trim().toLowerCase();
        if (!q) return trimItems;
        return trimItems.filter(t =>
            (t.name || t.item_name || '').toLowerCase().includes(q) ||
            (t.item_code || '').toLowerCase().includes(q)
        );
    }, [trimItems, itemSearch]);

    const selectedItem    = trimItems.find(t => String(t.id) === String(selectedItemId));
    const selectedVariant = variants.find(v => String(v.id) === String(selectedVariantId));

    // Group rows by variant when in item-scope (so multi-variant trims read clearly)
    const grouped = useMemo(() => {
        if (selectedVariantId) return null; // single-variant view, no grouping
        const buckets = new Map();
        rows.forEach(r => {
            const key = r.trim_item_variant_id || 'unknown';
            if (!buckets.has(key)) {
                buckets.set(key, {
                    variantId:    r.trim_item_variant_id,
                    variant_size: r.variant_size,
                    color_name:   r.color_name,
                    color_number: r.color_number,
                    rows:         [],
                });
            }
            buckets.get(key).rows.push(r);
        });
        return [...buckets.values()];
    }, [rows, selectedVariantId]);

    return (
        <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-5">
            {/* Header */}
            <div className="flex items-start justify-between gap-3">
                <div>
                    <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                        <BookOpen size={18} className="text-orange-500" />
                        Trims Stock Ledger
                    </h1>
                    <p className="text-sm text-slate-500 mt-0.5">
                        Audit every stock movement for a trim item or variant — inwards, fulfilments, reverts and manual adjustments.
                    </p>
                </div>
            </div>

            {/* Pickers */}
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_200px] gap-3">
                <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Trim Item *</label>
                    <div className="relative mt-1">
                        <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Search trim items…"
                            value={itemSearch}
                            onChange={e => setItemSearch(e.target.value)}
                            className="w-full text-xs border border-slate-200 rounded-lg pl-7 pr-2 py-1.5 focus:outline-none focus:border-orange-400"
                        />
                    </div>
                    <select
                        value={selectedItemId}
                        onChange={e => setSelectedItemId(e.target.value)}
                        disabled={trimItemsLoading}
                        className="w-full mt-1 text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-orange-400 bg-white"
                    >
                        <option value="">— Select trim item —</option>
                        {filteredTrimItems.map(t => (
                            <option key={t.id} value={t.id}>
                                {t.name || t.item_name || `Trim #${t.id}`}{t.item_code ? ` · ${t.item_code}` : ''}
                            </option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Variant (optional)</label>
                    <select
                        value={selectedVariantId}
                        onChange={e => setSelectedVariantId(e.target.value)}
                        disabled={!selectedItemId || variantsLoading}
                        className="w-full mt-1 text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-orange-400 bg-white disabled:bg-slate-100 disabled:text-slate-400"
                    >
                        <option value="">{selectedItemId ? 'All variants' : '— Pick a trim first —'}</option>
                        {variants.map(v => (
                            <option key={v.id} value={v.id}>
                                {v.color_number ? `${v.color_number} · ` : ''}{v.color_name || v.name || `Variant #${v.id}`}{v.variant_size ? ` · Sz ${v.variant_size}` : ''}
                            </option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                        <Filter size={11} /> Source
                    </label>
                    <select
                        value={sourceKind}
                        onChange={e => setSourceKind(e.target.value)}
                        className="w-full mt-1 text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-orange-400 bg-white"
                    >
                        <option value="">All sources</option>
                        {sourceKindOptions.map(k => (
                            <option key={k} value={k}>{sourceCfg(k).label}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Selection summary */}
            {selectedItem && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs">
                    <span className="font-bold text-slate-800">{selectedItem.name || selectedItem.item_name}</span>
                    {selectedItem.item_code && <span className="text-slate-400 ml-1.5 font-mono">· {selectedItem.item_code}</span>}
                    {selectedVariant ? (
                        <span className="ml-2 text-slate-600">
                            · {selectedVariant.color_number ? `${selectedVariant.color_number} · ` : ''}{selectedVariant.color_name || 'No color'}
                            {selectedVariant.variant_size ? ` · Sz ${selectedVariant.variant_size}` : ''}
                        </span>
                    ) : (
                        <span className="ml-2 text-slate-500">· all variants ({variants.length})</span>
                    )}
                </div>
            )}

            {err && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-sm text-red-600">
                    <AlertTriangle size={15} /> {err}
                </div>
            )}

            {/* Body */}
            {!selectedItemId ? (
                <div className="text-center py-20 text-slate-400">
                    <BookOpen size={40} className="mx-auto mb-3 opacity-30" />
                    <p className="font-medium">Pick a trim item to see its stock ledger.</p>
                </div>
            ) : loading ? (
                <div className="flex justify-center items-center py-20">
                    <Loader2 className="animate-spin h-7 w-7 text-orange-400" />
                </div>
            ) : rows.length === 0 ? (
                <div className="text-center py-20 text-slate-400">
                    <p className="font-medium">No ledger entries match this filter.</p>
                </div>
            ) : grouped ? (
                <div className="space-y-4">
                    {grouped.map(bucket => (
                        <LedgerGroup key={String(bucket.variantId)} bucket={bucket} />
                    ))}
                </div>
            ) : (
                <LedgerTable rows={rows} />
            )}

            {/* Pagination */}
            {selectedItemId && rows.length > 0 && (
                <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>
                        Showing rows {offset + 1}–{offset + rows.length}
                        {rows.length === PAGE_SIZE ? ' (more available)' : ''}
                    </span>
                    <div className="flex items-center gap-1.5">
                        <button
                            onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                            disabled={offset === 0}
                            className="flex items-center gap-1 px-2 py-1 rounded-md hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent"
                        >
                            <ChevronLeft size={12} /> Prev
                        </button>
                        <button
                            onClick={() => setOffset(offset + PAGE_SIZE)}
                            disabled={rows.length < PAGE_SIZE}
                            className="flex items-center gap-1 px-2 py-1 rounded-md hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent"
                        >
                            Next <ChevronRight size={12} />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function LedgerGroup({ bucket }) {
    const headerLabel = `${bucket.color_number ? `${bucket.color_number} · ` : ''}${bucket.color_name || 'No color'}${bucket.variant_size ? ` · Sz ${bucket.variant_size}` : ''}`;
    const netDelta = bucket.rows.reduce((s, r) => s + Number(r.delta || 0), 0);
    const latest = bucket.rows[0];
    return (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 bg-slate-50 border-b border-slate-100">
                <p className="text-sm font-bold text-slate-800">{headerLabel}</p>
                <div className="flex items-center gap-3 text-[11px] text-slate-500">
                    <span>{bucket.rows.length} entr{bucket.rows.length !== 1 ? 'ies' : 'y'}</span>
                    <span className={`font-bold tabular-nums ${netDelta > 0 ? 'text-emerald-600' : netDelta < 0 ? 'text-red-500' : 'text-slate-500'}`}>
                        Net {fmtSigned(netDelta)}
                    </span>
                    {latest?.stock_after != null && (
                        <span className="font-bold text-slate-700 tabular-nums">
                            Stock {Number(latest.stock_after).toLocaleString()}
                        </span>
                    )}
                </div>
            </div>
            <LedgerTable rows={bucket.rows} showVariant={false} />
        </div>
    );
}

function LedgerTable({ rows, showVariant = true }) {
    return (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-xs">
                <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider text-[10px]">
                    <tr>
                        <th className="text-left px-3 py-2 font-bold">Date</th>
                        {showVariant && <th className="text-left px-3 py-2 font-bold">Variant</th>}
                        <th className="text-left px-3 py-2 font-bold">Source</th>
                        <th className="text-right px-3 py-2 font-bold">Δ</th>
                        <th className="text-right px-3 py-2 font-bold">Before</th>
                        <th className="text-right px-3 py-2 font-bold">After</th>
                        <th className="text-left px-3 py-2 font-bold">Reference</th>
                        <th className="text-left px-3 py-2 font-bold">By</th>
                        <th className="text-left px-3 py-2 font-bold">Notes</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                    {rows.map((r, i) => {
                        const cfg = sourceCfg(r.source_kind);
                        const delta = Number(r.delta || 0);
                        const isUp = delta > 0;
                        const isDown = delta < 0;
                        return (
                            <tr key={`${r.created_at}-${i}`} className="hover:bg-slate-50/60">
                                <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{fmtDate(r.created_at)}</td>
                                {showVariant && (
                                    <td className="px-3 py-2 text-slate-700 whitespace-nowrap">
                                        {r.color_number ? <span className="font-mono text-slate-400 mr-1">{r.color_number}</span> : null}
                                        {r.color_name || '—'}
                                        {r.variant_size && <span className="ml-1 text-[9px] font-bold px-1 py-0.5 rounded bg-slate-100 text-slate-600">Sz {r.variant_size}</span>}
                                    </td>
                                )}
                                <td className="px-3 py-2">
                                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${cfg.cls}`}>
                                        {cfg.label}
                                    </span>
                                </td>
                                <td className={`px-3 py-2 text-right font-bold tabular-nums ${isUp ? 'text-emerald-600' : isDown ? 'text-red-500' : 'text-slate-500'}`}>
                                    {isUp && <TrendingUp size={11} className="inline mr-0.5" />}
                                    {isDown && <TrendingDown size={11} className="inline mr-0.5" />}
                                    {fmtSigned(delta)}
                                </td>
                                <td className="px-3 py-2 text-right text-slate-500 tabular-nums">{Number(r.stock_before ?? 0).toLocaleString()}</td>
                                <td className="px-3 py-2 text-right text-slate-700 font-bold tabular-nums">{Number(r.stock_after ?? 0).toLocaleString()}</td>
                                <td className="px-3 py-2 text-[11px] text-slate-600 whitespace-nowrap">
                                    {r.po_code && <span className="font-mono text-blue-700 mr-2">{r.po_code}</span>}
                                    {r.grn_number && <span className="font-mono text-emerald-700">GRN {r.grn_number}</span>}
                                    {!r.po_code && !r.grn_number && '—'}
                                </td>
                                <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{r.user_name || '—'}</td>
                                <td className="px-3 py-2 text-slate-500 max-w-xs truncate" title={r.notes || ''}>{r.notes || '—'}</td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}

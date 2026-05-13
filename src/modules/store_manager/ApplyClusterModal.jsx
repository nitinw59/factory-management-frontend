import { useState, useEffect, useMemo, useCallback } from 'react';
import {
    Loader2, X, AlertTriangle, CheckCircle2, RefreshCw, Layers, ChevronRight,
    ArrowRight, Network,
} from 'lucide-react';
import { adminApi } from '../../api/adminApi';
import { trimsApi } from '../../api/trimsApi';
import { swatchHex } from '../admin/TrimClustersPage';

// ── Sub-component: cluster row (left list) ───────────────────────────────────
function ClusterRow({ cluster, selected, applied, onClick, disabled }) {
    const isFallback = !!cluster.target_fabric_color_id;
    const targetColor = cluster.target_color
        || (cluster.target_fabric_color_id != null
                ? { id: cluster.target_fabric_color_id, color_name: cluster.target_color_name, color_number: cluster.target_color_number }
                : null);
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            className={`w-full text-left flex items-center gap-3 px-3 py-2.5 border-2 rounded-lg transition-colors ${
                selected
                    ? 'border-indigo-400 bg-indigo-50'
                    : 'border-slate-200 bg-white hover:border-indigo-200'
            } disabled:opacity-40`}
        >
            {isFallback
                ? <ArrowRight size={14} className={selected ? 'text-indigo-600 shrink-0' : 'text-slate-400 shrink-0'} />
                : <Network size={14}    className={selected ? 'text-indigo-600 shrink-0' : 'text-slate-400 shrink-0'} />}
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="text-sm font-bold text-slate-800 truncate">{cluster.name}</p>
                    <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full ${isFallback ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' : 'bg-violet-50 text-violet-700 border border-violet-200'}`}>
                        {isFallback ? 'Fallback' : 'Mesh'}
                    </span>
                    {applied?.applied && (
                        <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full ${applied.is_stale ? 'bg-amber-100 text-amber-700 border border-amber-200' : 'bg-emerald-100 text-emerald-700 border border-emerald-200'}`}>
                            {applied.is_stale ? 'Applied · Stale' : 'Applied'}
                        </span>
                    )}
                </div>
                <p className="text-[10px] text-slate-500 truncate flex items-center gap-1">
                    {(cluster.members?.length || 0)} {isFallback ? 'sources' : 'colors'}
                    {isFallback && targetColor && (
                        <>
                            <ArrowRight size={9} className="text-slate-300 shrink-0" />
                            <span className="w-2.5 h-2.5 rounded-full border border-slate-300 shrink-0" style={{ background: swatchHex(targetColor) }} />
                            <span className="truncate font-bold text-slate-700">{targetColor.color_name || `#${targetColor.id}`}</span>
                        </>
                    )}
                    {applied?.applied && (
                        <span className="ml-1 shrink-0">· {applied.row_count} row{applied.row_count === 1 ? '' : 's'}</span>
                    )}
                </p>
            </div>
            <div className="flex flex-wrap gap-0.5 max-w-[120px] shrink-0">
                {(cluster.members || []).slice(0, 8).map(m => (
                    <span key={m.fabric_color_id}
                        title={m.color_name}
                        className="w-2.5 h-2.5 rounded-full border border-slate-300"
                        style={{ background: swatchHex(m) }} />
                ))}
                {(cluster.members?.length || 0) > 8 && (
                    <span className="text-[8px] text-slate-400 self-center ml-0.5">+{cluster.members.length - 8}</span>
                )}
            </div>
        </button>
    );
}

// ── Preview pane ─────────────────────────────────────────────────────────────
function PreviewPane({ cluster, trimId, applied }) {
    const [preview, setPreview] = useState(null);
    const [loading, setLoading] = useState(false);
    const [err,     setErr]     = useState(null);
    const [symmetric, setSymmetric] = useState(true);

    const isFallback = !!cluster?.target_fabric_color_id;
    const targetColor = cluster?.target_color
        || (cluster?.target_fabric_color_id != null
                ? { id: cluster.target_fabric_color_id, color_name: cluster.target_color_name, color_number: cluster.target_color_number }
                : null);
    // Fallback is one-way by definition; the backend ignores symmetric for it,
    // but we still send `false` so the preview number is deterministic.
    const effectiveSymmetric = isFallback ? false : symmetric;

    const runPreview = useCallback(async () => {
        if (!cluster) return;
        setLoading(true); setErr(null);
        try {
            const res = await trimsApi.applyCluster(trimId, cluster.id, { symmetric: effectiveSymmetric, dry_run: true });
            setPreview(res.data ?? null);
        } catch (e) {
            setErr(e?.response?.data?.error || 'Could not preview apply.');
            setPreview(null);
        } finally {
            setLoading(false);
        }
    }, [cluster, trimId, effectiveSymmetric]);

    // Re-run preview whenever the cluster or symmetry toggle changes.
    useEffect(() => { setPreview(null); runPreview(); }, [runPreview]);

    if (!cluster) {
        return (
            <div className="flex flex-col items-center justify-center text-center text-slate-400 py-12 h-full">
                <Layers size={28} className="text-slate-300 mb-2" />
                <p className="text-sm">Pick a cluster on the left to preview the effect on this trim.</p>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="min-w-0">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Preview · {cluster.name}</p>
                    <p className="text-xs text-slate-500">Applies below — review the numbers before committing.</p>
                </div>
                {!isFallback ? (
                    <label className="flex items-center gap-1.5 text-[11px] font-medium text-slate-600">
                        <input type="checkbox" checked={symmetric} onChange={e => setSymmetric(e.target.checked)} />
                        Symmetric (a↔b)
                    </label>
                ) : (
                    <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-1 rounded-full">
                        One-way · fallback
                    </span>
                )}
            </div>

            {isFallback && targetColor && (
                <div className="flex items-center gap-2 px-3 py-2 bg-indigo-50/60 border border-indigo-200 rounded-lg">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-700">Direction</span>
                    <span className="text-[10px] text-slate-600">members</span>
                    <ArrowRight size={12} className="text-indigo-500" />
                    <span className="w-3 h-3 rounded-full border border-slate-300" style={{ background: swatchHex(targetColor) }} />
                    <span className="text-xs font-bold text-slate-800">{targetColor.color_name || `#${targetColor.id}`}</span>
                    <span className="text-[10px] text-slate-500 ml-auto">target must exist as a variant on this trim and size</span>
                </div>
            )}

            {err && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-100 rounded-lg px-3 py-2 text-xs text-red-700">
                    <AlertTriangle size={12} /> {err}
                </div>
            )}

            {loading ? (
                <div className="flex items-center gap-2 text-xs text-slate-400 py-6">
                    <Loader2 size={14} className="animate-spin" /> Calculating preview…
                </div>
            ) : preview ? (
                <>
                    <div className="grid grid-cols-2 gap-2">
                        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2.5">
                            <p className="text-[9px] font-bold uppercase tracking-wider text-emerald-700">Will create</p>
                            <p className="text-xl font-black text-emerald-700 tabular-nums">{preview.created ?? 0}</p>
                        </div>
                        <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5">
                            <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Skipped (same cluster)</p>
                            <p className="text-xl font-black text-slate-700 tabular-nums">{preview.skipped_already_mine ?? 0}</p>
                        </div>
                        {(preview.skipped_manual ?? 0) > 0 && (
                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-2.5">
                                <p className="text-[9px] font-bold uppercase tracking-wider text-blue-700">Skipped (manual)</p>
                                <p className="text-xl font-black text-blue-700 tabular-nums">{preview.skipped_manual}</p>
                            </div>
                        )}
                        {(preview.skipped_other_cluster ?? 0) > 0 && (
                            <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5">
                                <p className="text-[9px] font-bold uppercase tracking-wider text-amber-700">Skipped (other cluster)</p>
                                <p className="text-xl font-black text-amber-700 tabular-nums">{preview.skipped_other_cluster}</p>
                            </div>
                        )}
                    </div>

                    {(preview.size_groups || []).length > 0 && (
                        <div className="bg-white border border-slate-200 rounded-lg px-3 py-2">
                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">By size group</p>
                            <div className="flex flex-wrap gap-1.5">
                                {preview.size_groups.map(g => (
                                    <span key={`${g.size_label}-${g.variant_count}`}
                                        className="text-[10px] bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-full text-slate-600">
                                        <span className="font-bold text-slate-800">{g.size_label || '—'}</span>
                                        {' · '}{g.variant_count} variants{g.pair_count != null ? ` · ${g.pair_count} pairs` : ''}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    {(preview.affected_variants || []).length > 0 && (
                        <div className="bg-white border border-slate-200 rounded-lg px-3 py-2 max-h-40 overflow-y-auto">
                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Affected variants ({preview.affected_variants.length})</p>
                            <div className="flex flex-wrap gap-1">
                                {preview.affected_variants.map(v => (
                                    <span key={v.id} className="inline-flex items-center gap-1 text-[10px] bg-slate-50 border border-slate-200 px-1.5 py-0.5 rounded-full">
                                        <span className="w-2 h-2 rounded-full border border-slate-300"
                                            style={{ background: swatchHex({ color_name: v.color_name }) }} />
                                        <span className="text-slate-700">{v.color_name || `#${v.id}`}</span>
                                        {v.size_label && <span className="text-slate-400">· {v.size_label}</span>}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    {applied?.applied && applied.is_stale && (
                        <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                            <strong>Stale:</strong> this cluster is already applied but out of sync with its current members. Re-apply to bring it back in line.
                        </p>
                    )}
                </>
            ) : null}
        </div>
    );
}

// ── Modal ────────────────────────────────────────────────────────────────────
export default function ApplyClusterModal({ trimItem, onClose, onApplied }) {
    const trimId = trimItem?.id;
    const [clusters,      setClusters]      = useState([]);
    const [appliedByCluster, setAppliedByCluster] = useState({});  // {clusterId: {applied, row_count, is_stale}}
    const [loading,       setLoading]       = useState(true);
    const [err,           setErr]           = useState(null);
    const [selectedId,    setSelectedId]    = useState(null);
    const [applyBusy,     setApplyBusy]     = useState(false);
    const [unapplyBusyId, setUnapplyBusyId] = useState(null);
    const [message,       setMessage]       = useState(null);

    const load = useCallback(async () => {
        if (!trimId) return;
        setLoading(true); setErr(null);
        try {
            const [cRes, appliedRes] = await Promise.all([
                adminApi.trimClusters.list(false),
                trimsApi.clustersOnTrim(trimId),
            ]);
            const list = cRes.data?.data ?? cRes.data ?? [];
            setClusters(list);
            const applied = appliedRes.data?.data ?? appliedRes.data ?? [];
            const map = {};
            applied.forEach(a => {
                map[a.cluster_id] = { applied: true, row_count: a.row_count, is_stale: !!a.is_stale };
            });
            setAppliedByCluster(map);
        } catch (e) {
            setErr(e?.response?.data?.error || 'Failed to load clusters.');
        } finally {
            setLoading(false);
        }
    }, [trimId]);

    useEffect(() => { load(); }, [load]);

    const selectedCluster = useMemo(
        () => clusters.find(c => c.id === selectedId) || null,
        [clusters, selectedId]
    );

    const handleApply = async () => {
        if (!selectedCluster) return;
        // Fallback clusters are inherently one-way; mesh clusters default to symmetric.
        const symmetric = !selectedCluster.target_fabric_color_id;
        setApplyBusy(true); setErr(null); setMessage(null);
        try {
            const res = await trimsApi.applyCluster(trimId, selectedCluster.id, { symmetric, dry_run: false });
            const created = res.data?.created ?? 0;
            setMessage(`Applied "${selectedCluster.name}" · ${created} new substitute row${created === 1 ? '' : 's'} created.`);
            await load();
            onApplied?.();
        } catch (e) {
            setErr(e?.response?.data?.error || 'Apply failed.');
        } finally {
            setApplyBusy(false);
        }
    };

    const handleUnapply = async (cluster) => {
        if (!window.confirm(`Unapply cluster "${cluster.name}"? This removes the substitute rows it created on this trim — manual substitutes and rows from other clusters are kept.`)) return;
        setUnapplyBusyId(cluster.id); setErr(null); setMessage(null);
        try {
            const res = await trimsApi.unapplyCluster(trimId, cluster.id);
            setMessage(`Removed ${res.data?.removed ?? 0} row${res.data?.removed === 1 ? '' : 's'} from "${cluster.name}".`);
            await load();
            onApplied?.();
        } catch (e) {
            setErr(e?.response?.data?.error || 'Unapply failed.');
        } finally {
            setUnapplyBusyId(null);
        }
    };

    if (!trimItem) return null;

    return (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="flex items-start justify-between px-5 py-4 border-b border-slate-100 shrink-0">
                    <div className="min-w-0">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Apply Substitute Cluster</p>
                        <h2 className="text-base font-black text-slate-800 truncate">{trimItem.name || `Trim #${trimId}`}</h2>
                        <p className="text-xs text-slate-500 truncate">
                            Applies the cluster's color mesh across matching variants — same trim item, same size only.
                        </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                        <button onClick={load} disabled={loading}
                            className="p-1.5 hover:bg-slate-100 rounded-full disabled:opacity-40" title="Refresh">
                            <RefreshCw size={14} className={`text-slate-500 ${loading ? 'animate-spin' : ''}`} />
                        </button>
                        <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-full">
                            <X size={16} className="text-slate-500" />
                        </button>
                    </div>
                </div>

                {err && (
                    <div className="mx-5 mt-3 flex items-center gap-2 bg-red-50 border border-red-100 rounded-lg px-3 py-2 text-sm text-red-700">
                        <AlertTriangle size={14} /> {err}
                    </div>
                )}
                {message && (
                    <div className="mx-5 mt-3 flex items-center gap-2 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2 text-sm text-emerald-700">
                        <CheckCircle2 size={14} /> {message}
                    </div>
                )}

                {/* Currently-applied chip strip */}
                {Object.keys(appliedByCluster).length > 0 && (
                    <div className="px-5 py-2 border-b border-slate-100 bg-slate-50 flex items-center gap-2 flex-wrap shrink-0">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Currently applied:</span>
                        {clusters.filter(c => appliedByCluster[c.id]?.applied).map(c => {
                            const meta = appliedByCluster[c.id];
                            return (
                                <span key={c.id}
                                    className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${meta.is_stale ? 'bg-amber-100 text-amber-700 border-amber-200' : 'bg-emerald-100 text-emerald-700 border-emerald-200'}`}
                                >
                                    {c.name}
                                    <span className="text-[9px] font-normal opacity-80">· {meta.row_count}</span>
                                    {meta.is_stale && <span className="ml-0.5">⚠</span>}
                                    <button onClick={() => handleUnapply(c)} disabled={unapplyBusyId === c.id}
                                        className="ml-1 hover:text-red-600 disabled:opacity-40" title="Unapply">
                                        {unapplyBusyId === c.id ? <Loader2 size={9} className="animate-spin" /> : <X size={9} />}
                                    </button>
                                </span>
                            );
                        })}
                    </div>
                )}

                <div className="flex-1 grid grid-cols-1 md:grid-cols-5 gap-0 min-h-0">
                    {/* Left: cluster list */}
                    <div className="md:col-span-2 border-r border-slate-100 overflow-y-auto px-3 py-3 space-y-1.5">
                        {loading ? (
                            <div className="flex items-center justify-center py-8">
                                <Loader2 size={16} className="animate-spin text-slate-400" />
                            </div>
                        ) : clusters.length === 0 ? (
                            <p className="text-xs text-slate-400 italic py-6 text-center">
                                No clusters defined yet. Create one from <span className="font-mono">/admin/trim-clusters</span>.
                            </p>
                        ) : (
                            clusters.map(c => (
                                <ClusterRow key={c.id}
                                    cluster={c}
                                    selected={c.id === selectedId}
                                    applied={appliedByCluster[c.id]}
                                    onClick={() => setSelectedId(c.id === selectedId ? null : c.id)}
                                />
                            ))
                        )}
                    </div>

                    {/* Right: preview + actions */}
                    <div className="md:col-span-3 overflow-y-auto px-5 py-4">
                        <PreviewPane cluster={selectedCluster} trimId={trimId} applied={appliedByCluster[selectedCluster?.id]} />
                    </div>
                </div>

                <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-slate-100 shrink-0 bg-white">
                    <p className="text-[10px] text-slate-400 truncate">
                        {selectedCluster ? `Selected: ${selectedCluster.name}` : 'No cluster selected.'}
                    </p>
                    <div className="flex items-center gap-2">
                        <button onClick={onClose} disabled={applyBusy}
                            className="text-sm font-medium text-slate-500 hover:text-slate-700 px-3 py-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-40">
                            Close
                        </button>
                        <button onClick={handleApply}
                            disabled={!selectedCluster || applyBusy}
                            className="flex items-center gap-1.5 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 px-4 py-1.5 rounded-lg shadow-sm">
                            {applyBusy ? <Loader2 size={13} className="animate-spin" /> : <ChevronRight size={13} />}
                            {appliedByCluster[selectedCluster?.id]?.applied ? 'Re-apply' : 'Apply Cluster'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

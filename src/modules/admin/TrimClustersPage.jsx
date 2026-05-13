import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
    Loader2, Plus, Pencil, Trash2, AlertTriangle, CheckCircle2, Search,
    X, Save, Layers, RefreshCw, ChevronRight, ArrowRight, Target as TargetIcon, Network,
} from 'lucide-react';
import { adminApi } from '../../api/adminApi';
import { trimsApi } from '../../api/trimsApi';

// ── Color swatch heuristic ───────────────────────────────────────────────────
// fabric_colors doesn't carry a hex column, so derive a representative dot
// from the color name when possible; otherwise fall back to a neutral.
const NAME_HEX = [
    [/(^|[^a-z])black($|[^a-z])/i,        '#111827'],
    [/(^|[^a-z])white($|[^a-z])/i,        '#fafafa'],
    [/(^|[^a-z])ivory($|[^a-z])/i,        '#fffff0'],
    [/(^|[^a-z])beige($|[^a-z])/i,        '#e8d8b8'],
    [/(^|[^a-z])(grey|gray)($|[^a-z])/i,  '#9ca3af'],
    [/(^|[^a-z])silver($|[^a-z])/i,       '#c0c0c0'],
    [/(^|[^a-z])navy($|[^a-z])/i,         '#1e3a8a'],
    [/(^|[^a-z])royal($|[^a-z])/i,        '#1d4ed8'],
    [/(^|[^a-z])sky($|[^a-z])/i,          '#38bdf8'],
    [/(^|[^a-z])blue($|[^a-z])/i,         '#2563eb'],
    [/(^|[^a-z])teal($|[^a-z])/i,         '#0d9488'],
    [/(^|[^a-z])aqua($|[^a-z])/i,         '#06b6d4'],
    [/(^|[^a-z])green($|[^a-z])/i,        '#16a34a'],
    [/(^|[^a-z])olive($|[^a-z])/i,        '#6b7a3a'],
    [/(^|[^a-z])lime($|[^a-z])/i,         '#84cc16'],
    [/(^|[^a-z])yellow($|[^a-z])/i,       '#eab308'],
    [/(^|[^a-z])mustard($|[^a-z])/i,      '#caa53a'],
    [/(^|[^a-z])orange($|[^a-z])/i,       '#f97316'],
    [/(^|[^a-z])peach($|[^a-z])/i,        '#ffd6a5'],
    [/(^|[^a-z])red($|[^a-z])/i,          '#dc2626'],
    [/(^|[^a-z])maroon($|[^a-z])/i,       '#7f1d1d'],
    [/(^|[^a-z])burgundy($|[^a-z])/i,     '#841c2c'],
    [/(^|[^a-z])pink($|[^a-z])/i,         '#ec4899'],
    [/(^|[^a-z])purple($|[^a-z])/i,       '#9333ea'],
    [/(^|[^a-z])violet($|[^a-z])/i,       '#7c3aed'],
    [/(^|[^a-z])brown($|[^a-z])/i,        '#7c5a3a'],
    [/(^|[^a-z])khaki($|[^a-z])/i,        '#a39768'],
    [/(^|[^a-z])tan($|[^a-z])/i,          '#d2b48c'],
    [/(^|[^a-z])sand($|[^a-z])/i,         '#e0c089'],
    [/(^|[^a-z])cream($|[^a-z])/i,        '#f5ecd9'],
    [/(^|[^a-z])gold($|[^a-z])/i,         '#d4a017'],
    [/(^|[^a-z])mouse($|[^a-z])/i,        '#9b8a78'],
    [/(^|[^a-z])sandle($|[^a-z])/i,       '#caa97a'],
    [/(^|[^a-z])pista($|[^a-z])/i,        '#a8c97a'],
    [/(^|[^a-z])mehndi($|[^a-z])/i,       '#6b6024'],
    [/(^|[^a-z])(charcoal|chorcoal)($|[^a-z])/i, '#3a3a3a'],
];
const swatchHex = (color) => {
    if (!color) return '#cbd5e1';
    if (color.hex_code) return color.hex_code;
    if (color.color_hex) return color.color_hex;
    const name = (color.color_name || color.name || '').toLowerCase();
    for (const [re, hex] of NAME_HEX) if (re.test(name)) return hex;
    return '#cbd5e1';   // slate-300 fallback
};

// ── Family chips (auto-derived) ──────────────────────────────────────────────
const FAMILIES = [
    { key: 'neutrals', label: 'Neutrals',     re: /(black|white|ivory|beige|grey|gray|silver|cream|tan|sand|khaki|mouse|charcoal|chorcoal)/i },
    { key: 'blues',    label: 'Blues / Navy', re: /(navy|royal|sky|blue|teal|aqua)/i },
    { key: 'reds',     label: 'Reds / Pinks', re: /(red|maroon|burgundy|pink|rose)/i },
    { key: 'greens',   label: 'Greens',       re: /(green|olive|lime|pista|mehndi)/i },
    { key: 'yellows',  label: 'Yellows',      re: /(yellow|mustard|gold|sandle)/i },
    { key: 'oranges',  label: 'Oranges',      re: /(orange|peach)/i },
    { key: 'purples',  label: 'Purples',      re: /(purple|violet)/i },
    { key: 'browns',   label: 'Browns',       re: /(brown)/i },
];

// ── Color chip ───────────────────────────────────────────────────────────────
function ColorChip({ color, selected, disabled, onClick, compact }) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            title={`${color.color_name || color.name}${color.color_number ? ` (${color.color_number})` : ''}`}
            className={`flex items-center gap-1.5 ${compact ? 'px-2 py-1 text-[10px]' : 'px-2.5 py-1.5 text-xs'} rounded-lg border-2 transition-all text-left ${
                selected
                    ? 'border-indigo-400 bg-indigo-50 text-indigo-800'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-indigo-200'
            } disabled:opacity-40`}
        >
            <span
                className="w-3 h-3 rounded-full border border-slate-300 shrink-0"
                style={{ background: swatchHex(color) }}
            />
            <span className="font-medium truncate max-w-[120px]">
                {color.color_name || color.name || `#${color.id}`}
            </span>
            {color.color_number && (
                <span className="text-[9px] font-mono text-slate-400 shrink-0">{color.color_number}</span>
            )}
        </button>
    );
}

// ── Single-select target color picker ────────────────────────────────────────
function TargetPicker({ colors, value, onChange }) {
    const [q, setQ] = useState('');
    const selected = useMemo(() => colors.find(c => c.id === value) || null, [colors, value]);

    const lower = q.trim().toLowerCase();
    const filtered = useMemo(() => {
        if (!lower) return colors.slice(0, 60);
        return colors.filter(c => {
            const name = (c.color_name || c.name || '').toLowerCase();
            const num  = String(c.color_number || '').toLowerCase();
            return name.includes(lower) || num.includes(lower);
        }).slice(0, 60);
    }, [colors, lower]);

    return (
        <div className="space-y-2">
            {selected ? (
                <div className="flex items-center gap-2 bg-indigo-50 border-2 border-indigo-300 rounded-lg px-3 py-2">
                    <TargetIcon size={14} className="text-indigo-600 shrink-0" />
                    <span className="w-4 h-4 rounded-full border border-slate-300 shrink-0" style={{ background: swatchHex(selected) }} />
                    <span className="flex-1 text-sm font-bold text-indigo-800 truncate">
                        {selected.color_name || selected.name}
                        {selected.color_number && <span className="ml-1 text-xs font-mono text-indigo-500">{selected.color_number}</span>}
                    </span>
                    <button type="button" onClick={() => onChange(null)} className="text-indigo-400 hover:text-red-500 p-1 rounded">
                        <X size={13} />
                    </button>
                </div>
            ) : (
                <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    Pick the single target color — every member of this cluster will fall back to it. Required for fallback clusters.
                </p>
            )}
            <div className="relative">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                    type="search"
                    placeholder="Search to set / change target…"
                    value={q}
                    onChange={e => setQ(e.target.value)}
                    className="w-full text-xs pl-8 pr-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-400"
                />
            </div>
            <div className="max-h-40 overflow-y-auto border border-slate-100 rounded-lg p-1 bg-slate-50/50">
                {filtered.length === 0 ? (
                    <p className="text-xs text-slate-400 italic py-3 text-center">No colors match.</p>
                ) : (
                    <div className="flex flex-wrap gap-1">
                        {filtered.map(c => (
                            <ColorChip
                                key={c.id}
                                color={c}
                                selected={c.id === value}
                                onClick={() => onChange(c.id)}
                                compact
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

// ── Chip-grid color picker ───────────────────────────────────────────────────
function ColorPicker({ colors, selectedIds, onChange, excludeIds = null }) {
    const [q, setQ] = useState('');
    const [family, setFamily] = useState(null);

    const filtered = useMemo(() => {
        const lower = q.trim().toLowerCase();
        return colors.filter(c => {
            if (excludeIds && excludeIds.has(c.id)) return false;
            const name = (c.color_name || c.name || '').toLowerCase();
            const num  = String(c.color_number || '').toLowerCase();
            if (lower && !name.includes(lower) && !num.includes(lower)) return false;
            if (family) {
                const fam = FAMILIES.find(f => f.key === family);
                if (!fam || !fam.re.test(name)) return false;
            }
            return true;
        });
    }, [colors, q, family, excludeIds]);

    const visibleIds   = filtered.map(c => c.id);
    const allSelected  = visibleIds.length > 0 && visibleIds.every(id => selectedIds.has(id));
    const noneSelected = visibleIds.every(id => !selectedIds.has(id));

    const toggle = (id) => {
        const next = new Set(selectedIds);
        if (next.has(id)) next.delete(id); else next.add(id);
        onChange(next);
    };
    const selectAllVisible = () => {
        const next = new Set(selectedIds);
        visibleIds.forEach(id => next.add(id));
        onChange(next);
    };
    const clearVisible = () => {
        const next = new Set(selectedIds);
        visibleIds.forEach(id => next.delete(id));
        onChange(next);
    };
    const invertVisible = () => {
        const next = new Set(selectedIds);
        visibleIds.forEach(id => next.has(id) ? next.delete(id) : next.add(id));
        onChange(next);
    };

    return (
        <div className="space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
                <div className="relative flex-1 min-w-[200px]">
                    <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    <input
                        type="search"
                        placeholder="Search color name or number…"
                        value={q}
                        onChange={e => setQ(e.target.value)}
                        className="w-full text-xs pl-8 pr-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-400"
                    />
                </div>
                <span className="text-xs text-slate-500 tabular-nums">
                    <span className="font-bold text-indigo-700">{selectedIds.size}</span> selected · {filtered.length} of {colors.length} shown
                </span>
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Family</span>
                <button
                    type="button"
                    onClick={() => setFamily(null)}
                    className={`text-[10px] font-bold px-2 py-1 rounded-md border ${family === null ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'}`}
                >
                    All
                </button>
                {FAMILIES.map(f => (
                    <button
                        key={f.key}
                        type="button"
                        onClick={() => setFamily(family === f.key ? null : f.key)}
                        className={`text-[10px] font-bold px-2 py-1 rounded-md border ${family === f.key ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-200'}`}
                    >
                        {f.label}
                    </button>
                ))}
                <span className="text-slate-300">·</span>
                <button type="button" onClick={selectAllVisible} disabled={allSelected} className="text-[10px] font-bold text-emerald-700 hover:bg-emerald-50 border border-emerald-200 px-2 py-1 rounded-md disabled:opacity-40">Select All</button>
                <button type="button" onClick={invertVisible} className="text-[10px] font-bold text-slate-600 hover:bg-slate-50 border border-slate-200 px-2 py-1 rounded-md">Invert</button>
                <button type="button" onClick={clearVisible} disabled={noneSelected} className="text-[10px] font-bold text-red-600 hover:bg-red-50 border border-red-200 px-2 py-1 rounded-md disabled:opacity-40">Clear</button>
            </div>

            {filtered.length === 0 ? (
                <p className="text-xs text-slate-400 italic py-6 text-center">No colors match the filter.</p>
            ) : (
                <div className="flex flex-wrap gap-1.5 p-1">
                    {filtered.map(c => (
                        <ColorChip
                            key={c.id}
                            color={c}
                            selected={selectedIds.has(c.id)}
                            onClick={() => toggle(c.id)}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

// ── Cluster editor modal (create + edit) ─────────────────────────────────────
function ClusterEditor({ cluster, colors, onClose, onSaved }) {
    const isEdit = !!cluster;
    const initialTarget = cluster?.target_fabric_color_id ?? null;
    const [name,        setName]        = useState(cluster?.name || '');
    const [description, setDescription] = useState(cluster?.description || '');
    const [mode,        setMode]        = useState(initialTarget ? 'fallback' : 'mesh');
    const [targetId,    setTargetId]    = useState(initialTarget);
    const [selectedIds, setSelectedIds] = useState(
        () => new Set((cluster?.members || []).map(m => m.fabric_color_id))
    );
    const [saving, setSaving] = useState(false);
    const [err,    setErr]    = useState(null);

    // In fallback mode, the target can't also be a member — strip it transparently if it ever lands there.
    useEffect(() => {
        if (mode === 'fallback' && targetId && selectedIds.has(targetId)) {
            const next = new Set(selectedIds);
            next.delete(targetId);
            setSelectedIds(next);
        }
    }, [mode, targetId, selectedIds]);

    const effectiveTargetId = mode === 'fallback' ? targetId : null;
    const excludeIds = effectiveTargetId ? new Set([effectiveTargetId]) : null;

    const save = async () => {
        if (!name.trim()) { setErr('Name is required.'); return; }
        if (mode === 'fallback' && !targetId) {
            setErr('Pick a target color for the fallback cluster, or switch to mesh.');
            return;
        }
        setSaving(true); setErr(null);
        try {
            const body = {
                name: name.trim(),
                description: description.trim() || undefined,
                target_fabric_color_id: effectiveTargetId,
            };
            if (isEdit) {
                await adminApi.trimClusters.update(cluster.id, body);
                await adminApi.trimClusters.setMembers(cluster.id, [...selectedIds]);
            } else {
                await adminApi.trimClusters.create({
                    ...body,
                    fabric_color_ids: [...selectedIds],
                });
            }
            onSaved?.();
        } catch (e) {
            setErr(e?.response?.data?.error || (e?.response?.status === 409 ? 'A cluster with that name already exists.' : 'Save failed.'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="flex items-start justify-between px-5 py-4 border-b border-slate-100 shrink-0">
                    <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Trim Substitute Cluster</p>
                        <h2 className="text-base font-black text-slate-800">{isEdit ? `Edit · ${cluster.name}` : 'New Cluster'}</h2>
                    </div>
                    <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-full">
                        <X size={16} className="text-slate-500" />
                    </button>
                </div>

                <div className="flex-1 flex flex-col md:flex-row min-h-0">
                    {/* Left pane — all form headers / configuration */}
                    <div className="md:w-[360px] md:shrink-0 md:border-r border-slate-100 overflow-y-auto p-5 space-y-4">
                        {err && (
                            <div className="flex items-center gap-2 bg-red-50 border border-red-100 rounded-lg px-3 py-2 text-sm text-red-700">
                                <AlertTriangle size={14} /> {err}
                            </div>
                        )}

                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Name *</label>
                            <input
                                type="text" value={name} onChange={e => setName(e.target.value)}
                                placeholder="Neutrals, Navies, Pastels…"
                                className="w-full mt-1 text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-400"
                            />
                        </div>

                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Description</label>
                            <input
                                type="text" value={description} onChange={e => setDescription(e.target.value)}
                                placeholder="Optional"
                                className="w-full mt-1 text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-400"
                            />
                        </div>

                        {/* Mode toggle — mesh (all-to-all) vs fallback (members → target) */}
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Cluster Type</label>
                            <div className="mt-1 grid grid-cols-1 gap-2">
                                <button
                                    type="button"
                                    onClick={() => setMode('fallback')}
                                    className={`flex items-start gap-2 text-left p-3 rounded-lg border-2 transition ${mode === 'fallback' ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 bg-white hover:border-indigo-200'}`}
                                >
                                    <ArrowRight size={16} className={mode === 'fallback' ? 'text-indigo-600 shrink-0 mt-0.5' : 'text-slate-400 shrink-0 mt-0.5'} />
                                    <div className="min-w-0">
                                        <p className="text-sm font-bold text-slate-800">Fallback</p>
                                        <p className="text-[11px] text-slate-500 leading-snug">Every member color falls back to one target. One-way (member → target).</p>
                                    </div>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setMode('mesh')}
                                    className={`flex items-start gap-2 text-left p-3 rounded-lg border-2 transition ${mode === 'mesh' ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 bg-white hover:border-indigo-200'}`}
                                >
                                    <Network size={16} className={mode === 'mesh' ? 'text-indigo-600 shrink-0 mt-0.5' : 'text-slate-400 shrink-0 mt-0.5'} />
                                    <div className="min-w-0">
                                        <p className="text-sm font-bold text-slate-800">Mesh</p>
                                        <p className="text-[11px] text-slate-500 leading-snug">All members substitute for each other. Two-way mesh across the whole set.</p>
                                    </div>
                                </button>
                            </div>
                        </div>

                        {mode === 'fallback' && (
                            <div>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Target Color *</p>
                                <TargetPicker colors={colors} value={targetId} onChange={setTargetId} />
                            </div>
                        )}
                    </div>

                    {/* Right pane — member color picker (takes the remaining width + full height) */}
                    <div className="flex-1 flex flex-col overflow-hidden p-5">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                            Member Colors
                            {mode === 'fallback' && effectiveTargetId && (
                                <span className="ml-2 font-normal normal-case tracking-normal text-slate-500">
                                    — every selected color will sub to the target on the left
                                </span>
                            )}
                        </p>
                        <div className="flex-1 overflow-y-auto pr-1">
                            <ColorPicker
                                colors={colors}
                                selectedIds={selectedIds}
                                onChange={setSelectedIds}
                                excludeIds={excludeIds}
                            />
                        </div>
                    </div>
                </div>

                <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-slate-100 shrink-0">
                    <button onClick={onClose} disabled={saving}
                        className="text-sm font-medium text-slate-500 hover:text-slate-700 px-3 py-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-40">
                        Cancel
                    </button>
                    <button onClick={save} disabled={saving || !name.trim()}
                        className="flex items-center gap-1.5 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 px-4 py-1.5 rounded-lg shadow-sm">
                        {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                        {isEdit ? 'Save Changes' : 'Create Cluster'}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ── Cluster card ─────────────────────────────────────────────────────────────
function ClusterCard({ cluster, onEdit, onToggleActive, onDelete, busyId }) {
    const isBusy = busyId === cluster.id;
    const isFallback = !!cluster.target_fabric_color_id;
    // Hydrated target may come back as a nested object or as a separate field — handle both.
    const targetColor = cluster.target_color
        || (cluster.target_fabric_color_id != null
                ? {
                    id: cluster.target_fabric_color_id,
                    color_name: cluster.target_color_name,
                    color_number: cluster.target_color_number,
                }
                : null);
    return (
        <div className={`bg-white border rounded-2xl p-4 transition ${cluster.is_active ? 'border-slate-200' : 'border-slate-200 opacity-60'}`}>
            <div className="flex items-start justify-between gap-3 mb-3">
                <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm font-black text-slate-800">{cluster.name}</h3>
                        <span className={`inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${isFallback ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-violet-50 text-violet-700 border-violet-200'}`}>
                            {isFallback ? <ArrowRight size={9} /> : <Network size={9} />}
                            {isFallback ? 'Fallback' : 'Mesh'}
                        </span>
                        {!cluster.is_active && (
                            <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200">
                                Archived
                            </span>
                        )}
                        {cluster.stale_trim_count > 0 && (
                            <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200" title="Some trims using this cluster are out of sync. Re-apply on those trims.">
                                Stale · {cluster.stale_trim_count}
                            </span>
                        )}
                    </div>
                    {cluster.description && (
                        <p className="text-xs text-slate-500 mt-0.5 truncate">{cluster.description}</p>
                    )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => onEdit(cluster)} disabled={isBusy} title="Edit cluster"
                        className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded disabled:opacity-40">
                        <Pencil size={13} />
                    </button>
                    <button onClick={() => onToggleActive(cluster)} disabled={isBusy} title={cluster.is_active ? 'Archive' : 'Restore'}
                        className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded disabled:opacity-40">
                        {cluster.is_active ? <Trash2 size={13} /> : <RefreshCw size={13} />}
                    </button>
                    {!cluster.is_active && (
                        <button onClick={() => onDelete(cluster)} disabled={isBusy} title="Hard delete (admin only)"
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded disabled:opacity-40">
                            <X size={13} />
                        </button>
                    )}
                </div>
            </div>

            {isFallback && targetColor && (
                <div className="flex items-center gap-2 mb-3 px-2.5 py-1.5 bg-indigo-50/60 border border-indigo-100 rounded-lg">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-indigo-600 shrink-0">Falls back to</span>
                    <ArrowRight size={11} className="text-indigo-400 shrink-0" />
                    <span className="w-3 h-3 rounded-full border border-slate-300 shrink-0" style={{ background: swatchHex(targetColor) }} />
                    <span className="text-xs font-bold text-slate-800 truncate">
                        {targetColor.color_name || `#${targetColor.id}`}
                        {targetColor.color_number && <span className="ml-1 text-[10px] font-mono text-slate-400">{targetColor.color_number}</span>}
                    </span>
                </div>
            )}

            <div className="flex items-center gap-2 mb-3">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    {cluster.members?.length || 0} {isFallback ? 'source' : 'color'}{cluster.members?.length === 1 ? '' : 's'}
                </span>
                {cluster.applied_trim_count != null && (
                    <span className="text-[10px] text-slate-500">
                        · applied to <span className="font-bold text-slate-700">{cluster.applied_trim_count}</span> trim{cluster.applied_trim_count === 1 ? '' : 's'}
                    </span>
                )}
                {cluster.applied_substitute_count != null && (
                    <span className="text-[10px] text-slate-500">
                        · <span className="font-bold text-slate-700">{cluster.applied_substitute_count}</span> substitute rows
                    </span>
                )}
            </div>

            <div className="flex flex-wrap gap-1">
                {(cluster.members || []).slice(0, 24).map(m => (
                    <span key={m.fabric_color_id}
                        title={`${m.color_name}${m.color_number ? ` (${m.color_number})` : ''}`}
                        className="inline-flex items-center gap-1 text-[10px] bg-slate-50 border border-slate-200 px-1.5 py-0.5 rounded-full"
                    >
                        <span className="w-2 h-2 rounded-full border border-slate-300"
                            style={{ background: swatchHex(m) }} />
                        <span className="text-slate-700 max-w-[80px] truncate">{m.color_name}</span>
                    </span>
                ))}
                {(cluster.members?.length || 0) > 24 && (
                    <span className="text-[10px] text-slate-400 self-center">+{cluster.members.length - 24} more</span>
                )}
            </div>
        </div>
    );
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function TrimClustersPage() {
    const [clusters,         setClusters]         = useState([]);
    const [colors,           setColors]           = useState([]);
    const [loading,          setLoading]          = useState(true);
    const [err,              setErr]              = useState(null);
    const [includeInactive,  setIncludeInactive]  = useState(false);
    const [editing,          setEditing]          = useState(null);   // cluster or {} for new
    const [busyId,           setBusyId]           = useState(null);
    const didInit = useRef(false);

    const load = useCallback(async () => {
        setLoading(true); setErr(null);
        try {
            const [cRes, colRes] = await Promise.all([
                adminApi.trimClusters.list(includeInactive),
                didInit.current ? Promise.resolve(null) : trimsApi.getColors(),
            ]);
            setClusters(cRes.data?.data ?? cRes.data ?? []);
            if (colRes) {
                setColors(colRes.data?.data ?? colRes.data ?? []);
                didInit.current = true;
            }
        } catch (e) {
            setErr(e?.response?.data?.error || 'Failed to load clusters.');
        } finally {
            setLoading(false);
        }
    }, [includeInactive]);

    useEffect(() => { load(); }, [load]);

    const handleToggleActive = async (cluster) => {
        setBusyId(cluster.id);
        try {
            await adminApi.trimClusters.update(cluster.id, { is_active: !cluster.is_active });
            await load();
        } catch (e) {
            setErr(e?.response?.data?.error || 'Could not change status.');
        } finally {
            setBusyId(null);
        }
    };

    const handleDelete = async (cluster) => {
        if (!window.confirm(`Permanently delete cluster "${cluster.name}"? Any substitute rows it created will lose their cluster reference but remain in place.`)) return;
        setBusyId(cluster.id);
        try {
            await adminApi.trimClusters.remove(cluster.id);
            await load();
        } catch (e) {
            setErr(e?.response?.data?.error || 'Delete failed.');
        } finally {
            setBusyId(null);
        }
    };

    return (
        <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-5">
            <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                    <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                        <Layers size={20} className="text-indigo-500" /> Trim Substitute Clusters
                    </h1>
                    <p className="text-sm text-slate-500 mt-0.5">
                        Reusable color sets you can apply to any trim. Applying a cluster builds a symmetric substitute mesh among the trim's variants whose colors match — size-respecting.
                    </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
                        <input type="checkbox" checked={includeInactive} onChange={e => setIncludeInactive(e.target.checked)} />
                        Show archived
                    </label>
                    <button onClick={load} disabled={loading}
                        className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-indigo-600 border border-slate-200 hover:border-indigo-300 px-3 py-1.5 rounded-lg bg-white shadow-sm disabled:opacity-50">
                        <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
                    </button>
                    <button onClick={() => setEditing({})}
                        className="flex items-center gap-1.5 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 px-4 py-2 rounded-lg shadow-sm">
                        <Plus size={14} /> New Cluster
                    </button>
                </div>
            </div>

            {err && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-sm text-red-700">
                    <AlertTriangle size={15} /> {err}
                </div>
            )}

            {loading ? (
                <div className="flex justify-center items-center py-16">
                    <Loader2 className="animate-spin h-7 w-7 text-indigo-400" />
                </div>
            ) : clusters.length === 0 ? (
                <div className="text-center py-16 bg-white border-2 border-dashed border-slate-200 rounded-2xl">
                    <Layers className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                    <p className="text-base text-slate-500">No clusters yet</p>
                    <p className="text-sm text-slate-400 mt-1">Start by grouping the colors you reuse most — Neutrals, Navies, your brand reds…</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    {clusters.map(c => (
                        <ClusterCard key={c.id} cluster={c}
                            onEdit={setEditing}
                            onToggleActive={handleToggleActive}
                            onDelete={handleDelete}
                            busyId={busyId} />
                    ))}
                </div>
            )}

            {editing && (
                <ClusterEditor
                    cluster={editing.id ? editing : null}
                    colors={colors}
                    onClose={() => setEditing(null)}
                    onSaved={() => { setEditing(null); load(); }}
                />
            )}
        </div>
    );
}

// Helpers re-exported so the per-trim apply modal can reuse the swatch logic.
export { swatchHex, ColorChip };

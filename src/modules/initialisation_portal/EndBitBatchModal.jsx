import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    X, Loader2, AlertTriangle, Scissors, CheckCircle2, ChevronDown, ChevronUp, Layers,
} from 'lucide-react';
import { initializationPortalApi } from '../../api/initializationPortalApi';

/**
 * EndBitBatchModal — list AVAILABLE endbits split into "From this SOP" and
 * "From other SOPs", group by (fabric_type, fabric_color), let the user
 * multi-select within ONE group, merge into a virtual fabric_roll, then
 * optionally pivot to the Create Batch form so the new roll is reserved for
 * the current SOP.
 */
export default function EndBitBatchModal({ salesOrderProduct, onClose }) {
    const navigate = useNavigate();
    const sop = useMemo(() => salesOrderProduct || {}, [salesOrderProduct]);
    // Batches in this codebase use `batch_id`; some payloads also expose `id`. Read both.
    const sopBatches = useMemo(() => (sop.batches || []).filter(Boolean), [sop]);
    const sopBatchIds = useMemo(() => {
        const set = new Set();
        sopBatches.forEach(b => set.add(String(b.batch_id ?? b.id)));
        return set;
    }, [sopBatches]);

    const [endBits,  setEndBits]  = useState([]);
    const [loading,  setLoading]  = useState(true);
    const [err,      setErr]      = useState(null);
    const [selected, setSelected] = useState(new Set());  // Set<endbit_id>
    const [otherOpen, setOtherOpen] = useState(false);     // "From other SOPs" section collapse
    const [merging,  setMerging]  = useState(false);
    const [merged,   setMerged]   = useState(null);        // { fabric_roll_id, meter, endbit_ids } on success

    // Server-side filters. Empty string = no filter for that field.
    const [filterSourceBatch, setFilterSourceBatch] = useState('');
    const [filterFabricType,  setFilterFabricType]  = useState('');
    const [filterFabricColor, setFilterFabricColor] = useState('');

    // Universe of fabric_type / fabric_color options shown in the filter dropdowns.
    // Captured from the first unfiltered load so subsequent (filtered) responses
    // don't shrink the dropdown to a single option.
    const [fabricTypeOptions,  setFabricTypeOptions]  = useState([]);  // [{ id, name }]
    const [fabricColorOptions, setFabricColorOptions] = useState([]);  // [{ id, name, number }]

    const fetchEndBits = async () => {
        setLoading(true);
        setErr(null);
        try {
            const params = {};
            if (filterSourceBatch) params.source_batch_id  = filterSourceBatch;
            if (filterFabricType)  params.fabric_type_id   = filterFabricType;
            if (filterFabricColor) params.fabric_color_id  = filterFabricColor;
            const r = await initializationPortalApi.getAvailableEndBits(params);
            const list = r.data?.data ?? r.data ?? [];
            setEndBits(list);
            // Build dropdown universe on the very first (unfiltered) load only.
            if (!filterSourceBatch && !filterFabricType && !filterFabricColor) {
                const tMap = new Map(), cMap = new Map();
                list.forEach(eb => {
                    if (eb.fabric_type_id != null && !tMap.has(eb.fabric_type_id)) {
                        tMap.set(eb.fabric_type_id, { id: eb.fabric_type_id, name: eb.fabric_type_name || `Type #${eb.fabric_type_id}` });
                    }
                    if (eb.fabric_color_id != null && !cMap.has(eb.fabric_color_id)) {
                        cMap.set(eb.fabric_color_id, { id: eb.fabric_color_id, name: eb.fabric_color_name || `Color #${eb.fabric_color_id}`, number: eb.color_number });
                    }
                });
                setFabricTypeOptions([...tMap.values()]);
                setFabricColorOptions([...cMap.values()]);
            }
        } catch (e) {
            setErr(e?.response?.data?.error || 'Failed to load endbits.');
            setEndBits([]);
        } finally {
            setLoading(false);
        }
    };

    // Refetch whenever any filter changes. Clears selection so the user doesn't
    // confirm a merge involving an endbit that's no longer visible.
    useEffect(() => {
        setSelected(new Set());
        fetchEndBits();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filterSourceBatch, filterFabricType, filterFabricColor]);

    // Partition + group: { thisSop: Map<groupKey, rows[]>, other: Map<groupKey, rows[]> }
    const { thisSopGroups, otherGroups, groupMeta } = useMemo(() => {
        const meta = new Map();   // groupKey -> { fabric_type_id, fabric_color_id, fabric_type_name, fabric_color_name, color_number }
        const a = new Map();
        const b = new Map();
        for (const eb of endBits) {
            const key = `${eb.fabric_type_id}:${eb.fabric_color_id}`;
            if (!meta.has(key)) {
                meta.set(key, {
                    fabric_type_id:    eb.fabric_type_id,
                    fabric_color_id:   eb.fabric_color_id,
                    fabric_type_name:  eb.fabric_type_name || 'Fabric',
                    fabric_color_name: eb.fabric_color_name || '',
                    color_number:      eb.color_number || '',
                });
            }
            const target = sopBatchIds.has(String(eb.source_batch_id)) ? a : b;
            if (!target.has(key)) target.set(key, []);
            target.get(key).push(eb);
        }
        return { thisSopGroups: a, otherGroups: b, groupMeta: meta };
    }, [endBits, sopBatchIds]);

    // Map each endbit_id → its groupKey, so the selection-lock can disable
    // checkboxes in every other group once one is locked.
    const idToGroupKey = useMemo(() => {
        const m = new Map();
        endBits.forEach(eb => m.set(eb.id, `${eb.fabric_type_id}:${eb.fabric_color_id}`));
        return m;
    }, [endBits]);

    const activeGroupKey = useMemo(() => {
        if (selected.size === 0) return null;
        const firstId = selected.values().next().value;
        return idToGroupKey.get(firstId) || null;
    }, [selected, idToGroupKey]);

    const toggle = (id) => {
        setSelected(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const selectedMeters = useMemo(() => {
        let total = 0;
        endBits.forEach(eb => { if (selected.has(eb.id)) total += parseFloat(eb.meters) || 0; });
        return total;
    }, [endBits, selected]);

    // Auto-dismiss the success toast after a few seconds so repeated merges
    // stay non-blocking. Manually closing also clears it.
    useEffect(() => {
        if (!merged) return undefined;
        const t = setTimeout(() => setMerged(null), 6000);
        return () => clearTimeout(t);
    }, [merged]);

    const handleMerge = async () => {
        if (selected.size === 0) return;
        const sopId = sop.id ?? sop.sales_order_product_id;
        if (!sopId) {
            setErr('Cannot merge — sales order product context is missing.');
            return;
        }
        setMerging(true);
        setErr(null);
        try {
            const r = await initializationPortalApi.mergeEndBits([...selected], sopId);
            const payload = r.data?.data ?? r.data;
            // Surface as toast, clear selection, and refetch so the merged rows
            // drop out of AVAILABLE — the user can immediately merge another set.
            setMerged(payload);
            setSelected(new Set());
            fetchEndBits();
        } catch (e) {
            const msg = e?.response?.data?.error || 'Merge failed.';
            setErr(msg);
            if (/merged|consumed|not found/i.test(msg)) {
                setSelected(new Set());
                fetchEndBits();
            }
        } finally {
            setMerging(false);
        }
    };

    const goCreateBatch = (rollId) => {
        const target = rollId ?? merged?.fabric_roll_id;
        if (!target) return;
        const sId = sop.sales_order_id ?? sop.salesOrderId ?? '';
        const sopId = sop.id ?? sop.sales_order_product_id ?? '';
        const params = new URLSearchParams();
        if (sId)   params.set('salesOrderId',         String(sId));
        if (sopId) params.set('salesOrderProductId',  String(sopId));
        params.set('prefillFabricRollId', String(target));
        navigate(`/production-manager/dashboard/batches/new?${params.toString()}`);
    };

    const fmtMeter = (m) => Number(m || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
    const fmtDate  = (d) => d ? new Date(d).toLocaleDateString('en', { dateStyle: 'medium' }) : '—';

    const renderRow = (eb) => {
        const groupKey = idToGroupKey.get(eb.id);
        const isChecked = selected.has(eb.id);
        const disabled  = activeGroupKey != null && groupKey !== activeGroupKey;
        return (
            <label
                key={eb.id}
                title={disabled ? 'Merge only allows one fabric type + color at a time' : undefined}
                className={`flex items-center gap-3 px-3 py-2 text-sm border-b border-slate-50 last:border-b-0 ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer hover:bg-slate-50'}`}
            >
                <input
                    type="checkbox"
                    checked={isChecked}
                    disabled={disabled}
                    onChange={() => toggle(eb.id)}
                    className="w-4 h-4 accent-amber-500 shrink-0"
                />
                <span className="font-bold text-slate-800 tabular-nums w-20 shrink-0">{fmtMeter(eb.meters)} m</span>
                <span className="text-xs text-slate-500 font-mono shrink-0">{eb.source_batch_number || `B-${eb.source_batch_id}`}</span>
                <span className="text-[10px] text-slate-400 ml-auto shrink-0">{fmtDate(eb.created_at)}</span>
            </label>
        );
    };

    const renderGroup = (key, rows) => {
        const meta = groupMeta.get(key);
        if (!meta || rows.length === 0) return null;
        const groupTotal = rows.reduce((s, r) => s + (parseFloat(r.meters) || 0), 0);
        const colorLabel = [meta.color_number, meta.fabric_color_name].filter(Boolean).join(' · ');
        return (
            <div key={key} className="mb-3 bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border-b border-slate-100">
                    <p className="text-sm font-bold text-slate-700">
                        {meta.fabric_type_name}
                        {colorLabel && <span className="text-slate-500 font-normal"> · {colorLabel}</span>}
                    </p>
                    <p className="text-xs text-slate-500 tabular-nums">
                        {rows.length} bit{rows.length === 1 ? '' : 's'} · {fmtMeter(groupTotal)} m total
                    </p>
                </div>
                <div>{rows.map(renderRow)}</div>
            </div>
        );
    };

    const thisSopKeys  = [...thisSopGroups.keys()];
    const otherKeys    = [...otherGroups.keys()];
    const thisSopTotal = [...thisSopGroups.values()].reduce((s, rows) => s + rows.length, 0);
    const otherTotal   = [...otherGroups.values()].reduce((s, rows) => s + rows.length, 0);

    return (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-100">
                    <div>
                        <h2 className="text-base font-black text-slate-800 flex items-center gap-2">
                            <Scissors size={16} className="text-amber-500" />
                            Pool EndBits → Virtual Fabric Roll
                        </h2>
                        <p className="text-xs text-slate-500 mt-0.5">
                            {sop.name ? <>For <span className="font-bold text-slate-700">{sop.name}</span></> : 'Merge endbits sharing one fabric type + color.'}
                        </p>
                    </div>
                    <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-full transition shrink-0">
                        <X size={16} className="text-slate-500" />
                    </button>
                </div>

                <div className="overflow-auto flex-1 px-5 py-4">
                    {err && (
                        <div className="mb-3 flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-sm text-red-700">
                            <AlertTriangle size={14} /> {err}
                        </div>
                    )}

                    {/* Success toast — auto-dismisses; click "Create Batch" to navigate, or X to clear. */}
                    {merged && (
                        <div className="mb-3 flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 text-sm text-emerald-800 animate-in fade-in duration-200">
                            <div className="shrink-0 w-7 h-7 rounded-full bg-emerald-100 flex items-center justify-center">
                                <CheckCircle2 size={14} className="text-emerald-600" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-xs font-bold">
                                    Virtual roll #{merged.fabric_roll_id} created · {fmtMeter(merged.meter)} m
                                </p>
                                <p className="text-[10px] text-emerald-700/80">
                                    {(merged.endbit_ids || []).length} endbits merged · reserved for {sop.name || 'this SOP'}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => goCreateBatch(merged.fabric_roll_id)}
                                className="shrink-0 text-[10px] font-bold text-white bg-emerald-600 hover:bg-emerald-700 px-2.5 py-1 rounded-md transition"
                            >
                                Create Batch
                            </button>
                            <button
                                type="button"
                                onClick={() => setMerged(null)}
                                title="Dismiss"
                                className="shrink-0 p-1 rounded hover:bg-emerald-100 text-emerald-700"
                            >
                                <X size={12} />
                            </button>
                        </div>
                    )}

                    {/* Server-side filters — sent on the GET /endbits/available query. */}
                    {(
                        <div className="mb-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
                            <select
                                value={filterSourceBatch}
                                onChange={e => setFilterSourceBatch(e.target.value)}
                                className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:border-amber-400"
                            >
                                <option value="">Source batch — all</option>
                                {sopBatches.map(b => {
                                    const id = b.batch_id ?? b.id;
                                    return <option key={id} value={id}>{b.batch_code || `Batch #${id}`} (this SOP)</option>;
                                })}
                            </select>
                            <select
                                value={filterFabricType}
                                onChange={e => setFilterFabricType(e.target.value)}
                                className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:border-amber-400"
                            >
                                <option value="">Fabric type — all</option>
                                {fabricTypeOptions.map(t => (
                                    <option key={t.id} value={t.id}>{t.name}</option>
                                ))}
                            </select>
                            <select
                                value={filterFabricColor}
                                onChange={e => setFilterFabricColor(e.target.value)}
                                className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:border-amber-400"
                            >
                                <option value="">Fabric color — all</option>
                                {fabricColorOptions.map(c => (
                                    <option key={c.id} value={c.id}>
                                        {c.number ? `${c.number} · ` : ''}{c.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}
                    {(filterSourceBatch || filterFabricType || filterFabricColor) && (
                        <button
                            type="button"
                            onClick={() => { setFilterSourceBatch(''); setFilterFabricType(''); setFilterFabricColor(''); }}
                            className="mb-3 text-[10px] font-bold text-slate-500 hover:text-slate-700 uppercase tracking-wider underline"
                        >
                            Clear filters
                        </button>
                    )}

                    {loading ? (
                        <div className="flex items-center justify-center py-12">
                            <Loader2 className="animate-spin h-6 w-6 text-amber-500" />
                        </div>
                    ) : endBits.length === 0 ? (
                        <div className="py-12 text-center text-slate-400">
                            <Layers size={32} className="mx-auto mb-2 opacity-40" />
                            <p className="font-medium">No available endbits found.</p>
                            <p className="text-xs mt-1">Endbits become available after a cutting log is recorded with end-bits meters.</p>
                        </div>
                    ) : (
                        <>
                            {/* From this SOP */}
                            <div className="mb-4">
                                <div className="flex items-center gap-2 mb-2">
                                    <span className="w-1.5 h-4 rounded-full bg-emerald-500" />
                                    <p className="text-xs font-black text-emerald-700 uppercase tracking-wider">
                                        From this SOP · {thisSopTotal} bit{thisSopTotal === 1 ? '' : 's'}
                                    </p>
                                </div>
                                {thisSopKeys.length === 0 ? (
                                    <p className="text-[11px] text-slate-400 italic pl-3.5">No endbits from this SOP's batches yet.</p>
                                ) : (
                                    thisSopKeys.map(k => renderGroup(k, thisSopGroups.get(k)))
                                )}
                            </div>

                            {/* From other SOPs (collapsed by default) */}
                            <div>
                                <button
                                    type="button"
                                    onClick={() => setOtherOpen(o => !o)}
                                    className="w-full flex items-center justify-between gap-2 mb-2 px-2 py-1 rounded-lg hover:bg-slate-50"
                                >
                                    <span className="flex items-center gap-2">
                                        <span className="w-1.5 h-4 rounded-full bg-slate-400" />
                                        <span className="text-xs font-black text-slate-600 uppercase tracking-wider">
                                            From other SOPs · {otherTotal} bit{otherTotal === 1 ? '' : 's'}
                                        </span>
                                    </span>
                                    {otherOpen
                                        ? <ChevronUp size={14} className="text-slate-400" />
                                        : <ChevronDown size={14} className="text-slate-400" />}
                                </button>
                                {otherOpen && (
                                    otherKeys.length === 0
                                        ? <p className="text-[11px] text-slate-400 italic pl-3.5">No endbits available from other SOPs.</p>
                                        : otherKeys.map(k => renderGroup(k, otherGroups.get(k)))
                                )}
                            </div>
                        </>
                    )}
                </div>

                {/* Footer — stays the same after a successful merge so the user
                    can keep selecting and merging more endbits without exiting. */}
                <div className="flex items-center justify-between gap-3 px-5 py-4 border-t border-slate-100 bg-slate-50/40">
                    <p className="text-[11px] text-slate-500 tabular-nums">
                        {selected.size > 0
                            ? <>Selected <span className="font-bold text-slate-700">{selected.size}</span> bit{selected.size === 1 ? '' : 's'} · <span className="font-bold text-slate-700">{fmtMeter(selectedMeters)} m</span></>
                            : 'Tick endbits in a single group to merge.'}
                    </p>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={onClose}
                            disabled={merging}
                            className="text-xs font-medium text-slate-500 hover:text-slate-700 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition disabled:opacity-40"
                        >
                            Close
                        </button>
                        <button
                            onClick={handleMerge}
                            disabled={merging || selected.size === 0}
                            className="flex items-center gap-1.5 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-40 px-4 py-1.5 rounded-lg transition shadow-sm"
                        >
                            {merging && <Loader2 size={12} className="animate-spin" />}
                            Merge {selected.size > 0 ? `${selected.size} bit${selected.size === 1 ? '' : 's'} = ${fmtMeter(selectedMeters)} m` : 'selected'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

import { useEffect, useMemo, useState } from 'react';
import { X, Loader2, AlertTriangle, ArrowLeft, CheckCircle2, Link2, ChevronDown, ChevronUp, Zap, PartyPopper } from 'lucide-react';
import { purchaseDeptApi } from '../../api/purchaseDeptApi';
import { labelFromGroup } from './inwardShared';
import SupplierCodePill from './SupplierCodePill';

/**
 * InwardReviewModal — shows the prepared items, lets the user confirm or go back.
 *
 * Props
 *   poId           — PO id we'll POST/PATCH against
 *   inward         — existing inward (edit) or null (create)
 *   payload        — { items, grnNumber, receivedDate, condition, notes, scanFile }
 *   poItems        — joined PO items (for label lookup)
 *   trimItems, fabricTypes, fabricColors, variantsByTrim — lookups for custom rows
 *   onBack(payload) — user wants to edit; parent should re-open the form preserving state
 *   onConfirmed(savedInward) — server returned success
 *   onClose()      — close everything
 */
export default function InwardReviewModal({
    poId,
    poCode,
    inward = null,
    payload,
    poItems = [],
    supplierId,
    supplierName,
    trimItems = [],
    fabricTypes = [],
    fabricColors = [],
    variantsByTrim = {},
    onBack,
    onConfirmed,
    onClose,
}) {
    const [busy, setBusy] = useState(false);
    const [err,  setErr]  = useState(null);
    // Server-confirmed inward — when set, the modal shows a success screen
    // instead of the review body; onConfirmed fires only when the user dismisses.
    const [saved, setSaved] = useState(null);
    // allocations[itemIdx][prId] = qty (string from the input)
    const [allocations, setAllocations] = useState({});
    // Per-item expand state for the allocation accordion.
    const [expandedAllocs, setExpandedAllocs] = useState(new Set());

    const toggleExpandAlloc = (idx) => setExpandedAllocs(prev => {
        const next = new Set(prev);
        if (next.has(idx)) next.delete(idx); else next.add(idx);
        return next;
    });

    // Greedy fill: distribute `itemQty` across the matched PRs in urgency order.
    const fillAllReqs = (itemIdx, reqs, itemQty) => {
        const URG = { urgent: 0, high: 1, normal: 2, low: 3 };
        const sorted = [...reqs].sort((a, b) => {
            const ua = URG[(a.urgency || 'normal').toString().toLowerCase()] ?? 2;
            const ub = URG[(b.urgency || 'normal').toString().toLowerCase()] ?? 2;
            return ua - ub;
        });
        const next = {};
        let remaining = Number(itemQty || 0);
        for (const pr of sorted) {
            if (remaining <= 0) break;
            const reqQty = Number(pr.quantity_required ?? pr.quantity ?? pr.meters_required ?? 0);
            const fill = Math.min(reqQty > 0 ? reqQty : remaining, remaining);
            if (fill > 0) {
                next[pr.id] = String(fill);
                remaining -= fill;
            }
        }
        setAllocations(prev => ({ ...prev, [itemIdx]: next }));
    };

    const clearAllAlloc = (itemIdx) => setAllocations(prev => {
        const next = { ...prev };
        delete next[itemIdx];
        return next;
    });
    // System-wide pending purchase requirements (across SOs). We match these to
    // each inward item's PO line by material id so the buyer can fulfill PRs
    // that aren't pre-linked to this PO.
    const [openReqs,       setOpenReqs]       = useState([]);
    const [loadingOpenReqs, setLoadingOpenReqs] = useState(false);

    useEffect(() => {
        let cancelled = false;
        setLoadingOpenReqs(true);
        purchaseDeptApi.getRequirements({ status: 'PENDING' })
            .then(r => {
                if (cancelled) return;
                setOpenReqs(r.data?.data ?? r.data ?? []);
            })
            .catch(() => { if (!cancelled) setOpenReqs([]); })
            .finally(() => { if (!cancelled) setLoadingOpenReqs(false); });
        return () => { cancelled = true; };
    }, []);

    const isCreate = !inward;

    const setAllocation = (itemIdx, prId, qtyStr) => {
        setAllocations(prev => {
            const next = { ...prev };
            const inner = { ...(next[itemIdx] || {}) };
            if (qtyStr === '' || qtyStr == null) delete inner[prId];
            else inner[prId] = qtyStr;
            if (Object.keys(inner).length === 0) delete next[itemIdx];
            else next[itemIdx] = inner;
            return next;
        });
    };

    // For each PO-item-linked inward row, find pending purchase requirements that
    // match the item's material — trim by trim_item_variant_id, fabric by
    // (fabric_type_id, fabric_color_id). The PO line itself often has no inline
    // requirements; we resolve from the system-wide open-requirements list so
    // the buyer can fulfill PRs from any SO (including cross-SO custom POs).
    const pendingReqsByItem = useMemo(() => {
        const m = {};
        (payload?.items || []).forEach((it, idx) => {
            if (it.purchase_order_item_id == null) return;
            if (it.rolls && it.rolls.length > 0) return;
            const p = (poItems || []).find(x => String(x.id) === String(it.purchase_order_item_id));
            if (!p) return;
            const isFabric = p.item_type === 'fabric';
            const matches = (openReqs || []).filter(r => {
                const status = (r.status || '').toString().toUpperCase();
                if (status !== 'PENDING') return false;
                if (isFabric) {
                    if (r.type !== 'fabric') return false;
                    return String(r.fabric_type_id)  === String(p.fabric_type_id)
                        && String(r.fabric_color_id) === String(p.fabric_color_id);
                }
                if (r.type !== 'trim') return false;
                return String(r.trim_item_variant_id) === String(p.trim_item_variant_id);
            });
            if (matches.length > 0) m[idx] = matches;
        });
        return m;
    }, [payload, poItems, openReqs]);

    const reqIdToPoGroup = useMemo(() => {
        const m = new Map();
        (poItems || []).forEach(g => (g.requirements || []).forEach(r => m.set(r.id, g)));
        return m;
    }, [poItems]);

    const summary = useMemo(() => {
        const variantPool = Object.values(variantsByTrim).flat();
        return (payload?.items || []).map((it, idx) => {
            // If the Create modal already stamped a label, prefer it — no lookup needed.
            if (it._label) {
                return {
                    key:      `r-${idx}`,
                    idx,
                    name:     it._label.name || 'Item',
                    details:  it._label.details || '',
                    qty:      it.qty_received,
                    unit:     it._label.unit || 'pcs',
                    rolls:    it.rolls || null,
                    boxes:    it.boxes || null,
                    isTrim:   it.item_type !== 'fabric',
                    variantId: it.trim_item_variant_id ?? null,
                };
            }
            if (it.requirement_id != null) {
                const g = reqIdToPoGroup.get(it.requirement_id);
                const isFabric = g?.item_type === 'fabric';
                const { name, details } = labelFromGroup(g);
                return {
                    key:      `r-${idx}`,
                    idx,
                    name:     name || `Requirement #${it.requirement_id}`,
                    details,
                    qty:      it.qty_received,
                    unit:     isFabric ? 'm' : (g?.uom || 'pcs'),
                    rolls:    it.rolls || null,
                    boxes:    it.boxes || null,
                    isTrim:   !isFabric,
                    variantId: g?.trim_item_variant_id ?? null,
                };
            }
            if (it.purchase_order_item_id != null) {
                const wantPo = String(it.purchase_order_item_id);
                const p = (poItems || []).find(x => String(x.id) === wantPo);
                const isFabric = p?.item_type === 'fabric';
                const { name, details } = labelFromGroup(p);
                return {
                    key:      `po-${idx}`,
                    idx,
                    name:     name || `PO item #${it.purchase_order_item_id}`,
                    details,
                    qty:      it.qty_received,
                    unit:     isFabric ? 'm' : (p?.uom || 'pcs'),
                    rolls:    it.rolls || null,
                    boxes:    it.boxes || null,
                    isTrim:   !isFabric,
                    variantId: p?.trim_item_variant_id ?? null,
                };
            }
            const isFabric = it.item_type === 'fabric';
            let name = '';
            let details = '';
            if (isFabric) {
                const t = fabricTypes.find(x => String(x.id) === String(it.fabric_type_id));
                const c = fabricColors.find(x => String(x.id) === String(it.fabric_color_id));
                name = t?.name || t?.fabric_type_name || 'Fabric';
                const parts = [];
                if (c?.color_number) parts.push(c.color_number);
                if (c?.color_name)   parts.push(c.color_name);
                details = parts.join(' · ');
            } else {
                const v = variantPool.find(x => String(x.id) === String(it.trim_item_variant_id));
                const trimParent = v ? trimItems.find(t => String(t.id) === String(v.trim_item_id)) : null;
                name = trimParent?.name || trimParent?.item_name || 'Trim';
                if (v) {
                    const parts = [];
                    if (v.color_number)  parts.push(v.color_number);
                    if (v.color_name)    parts.push(v.color_name);
                    if (v.variant_size)  parts.push(`Sz ${v.variant_size}`);
                    details = parts.join(' · ');
                } else {
                    details = `Variant #${it.trim_item_variant_id}`;
                }
            }
            return {
                key:      `c-${idx}`,
                idx,
                name,
                details,
                qty:      it.qty_received,
                unit:     isFabric ? 'm' : 'pcs',
                rolls:    it.rolls || null,
                boxes:    it.boxes || null,
                isTrim:   !isFabric,
                variantId: it.trim_item_variant_id ?? null,
            };
        });
    }, [payload, reqIdToPoGroup, poItems, fabricTypes, fabricColors, variantsByTrim, trimItems]);

    // ── Consolidated received-breakdown views ───────────────────────────────
    // A GRN is a physical receipt, so alongside the per-line list we show two
    // roll-ups: every fabric roll grouped by fabric type + colour, and every
    // boxed line's box breakdown. These read off `summary`, so they reflect
    // exactly what will be posted.

    // Merge roll fragments of the same physical bale back together (FCFS
    // distribution may split one bale across requirements) for a clean bale list.
    const mergeRolls = (rolls) => {
        const byBale = new Map();
        const anon = [];
        (rolls || []).forEach(r => {
            const meter = parseFloat(r.meter) || 0;
            if (meter <= 0) return;
            const uom  = r.uom || 'm';
            const bale = (r.bale_no || '').trim();
            if (!bale) { anon.push({ bale_no: '', meter, uom }); return; }
            const k = `${bale}||${uom}`;
            if (byBale.has(k)) byBale.get(k).meter += meter;
            else byBale.set(k, { bale_no: bale, meter, uom });
        });
        return [...byBale.values(), ...anon];
    };

    const fabricRollGroups = useMemo(() => {
        const m = new Map();
        summary.forEach(row => {
            if (row.isTrim || !row.rolls || row.rolls.length === 0) return;
            const key = `${row.name}||${row.details}`;
            if (!m.has(key)) m.set(key, { key, name: row.name, details: row.details, unit: row.unit || 'm', rolls: [] });
            m.get(key).rolls.push(...row.rolls);
        });
        return [...m.values()].map(g => {
            const rolls = mergeRolls(g.rolls);
            return { ...g, rolls, totalMeters: rolls.reduce((s, r) => s + r.meter, 0) };
        });
    }, [summary]);

    const boxedRows = useMemo(
        () => summary.filter(row => row.boxes && row.boxes.length > 0),
        [summary]
    );

    const breakdownPanel = (fabricRollGroups.length > 0 || boxedRows.length > 0) && (
        <div className="space-y-2">
            {fabricRollGroups.length > 0 && (
                <div className="bg-violet-50/40 border border-violet-200 rounded-xl p-3">
                    <p className="text-[10px] font-bold text-violet-700 uppercase tracking-wider mb-2">Rolls received · by fabric</p>
                    <div className="space-y-2.5">
                        {fabricRollGroups.map(g => (
                            <div key={g.key}>
                                <div className="flex items-center justify-between gap-2">
                                    <p className="text-xs font-bold text-slate-800 truncate">
                                        {g.name}{g.details && <span className="font-normal text-slate-500"> · {g.details}</span>}
                                    </p>
                                    <p className="text-[11px] font-bold text-violet-700 tabular-nums shrink-0">
                                        {g.totalMeters.toLocaleString(undefined, { maximumFractionDigits: 2 })} m · {g.rolls.length} roll{g.rolls.length !== 1 ? 's' : ''}
                                    </p>
                                </div>
                                <ul className="mt-1 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-0.5">
                                    {g.rolls.map((r, i) => (
                                        <li key={i} className="flex items-center justify-between gap-2 text-[10px] font-mono text-slate-500">
                                            <span className="truncate">{r.bale_no || '—'}</span>
                                            <span className="tabular-nums shrink-0">{r.meter.toLocaleString(undefined, { maximumFractionDigits: 2 })} {r.uom}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </div>
                </div>
            )}
            {boxedRows.length > 0 && (
                <div className="bg-amber-50/40 border border-amber-200 rounded-xl p-3">
                    <p className="text-[10px] font-bold text-amber-700 uppercase tracking-wider mb-2">Box breakdown</p>
                    <div className="space-y-2.5">
                        {boxedRows.map(row => {
                            const totalBoxes = row.boxes.reduce((s, b) => s + (parseFloat(b.box_count) || 0), 0);
                            const totalQty   = row.boxes.reduce((s, b) => s + (parseFloat(b.box_count) || 0) * (parseFloat(b.qty_per_box) || 0), 0);
                            return (
                                <div key={row.key}>
                                    <div className="flex items-center justify-between gap-2">
                                        <p className="text-xs font-bold text-slate-800 truncate">
                                            {row.name}{row.details && <span className="font-normal text-slate-500"> · {row.details}</span>}
                                        </p>
                                        <p className="text-[11px] font-bold text-amber-700 tabular-nums shrink-0">
                                            {totalQty.toLocaleString(undefined, { maximumFractionDigits: 2 })} {row.unit} · {totalBoxes} box{totalBoxes !== 1 ? 'es' : ''}
                                        </p>
                                    </div>
                                    <ul className="mt-1 space-y-0.5">
                                        {row.boxes.map((b, i) => {
                                            const bc = parseFloat(b.box_count) || 0;
                                            const qpb = parseFloat(b.qty_per_box) || 0;
                                            return (
                                                <li key={i} className="flex items-center justify-between gap-2 text-[10px] text-slate-500">
                                                    <span className="font-mono">{bc.toLocaleString()} box{bc !== 1 ? 'es' : ''} × {qpb.toLocaleString(undefined, { maximumFractionDigits: 2 })} {row.unit}</span>
                                                    <span className="tabular-nums shrink-0 font-bold text-slate-600">{(bc * qpb).toLocaleString(undefined, { maximumFractionDigits: 2 })} {row.unit}</span>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );

    // Build the final items array: split each PO-item-linked entry into per-PR
    // entries when the user has allocated qty to specific requirements, leaving
    // any remainder as a PO-item entry.
    const buildOutgoingItems = () => {
        const out = [];
        for (let idx = 0; idx < (payload?.items || []).length; idx++) {
            const it = payload.items[idx];
            /* eslint-disable no-unused-vars */
            const { _label, ...rest } = it;
            /* eslint-enable no-unused-vars */
            const alloc = allocations[idx];
            const allocEntries = alloc
                ? Object.entries(alloc).filter(([, v]) => parseFloat(v) > 0)
                : [];
            if (allocEntries.length === 0) {
                out.push(rest);
                continue;
            }
            const itemQty = Number(it.qty_received || 0);
            const totalAlloc = allocEntries.reduce((s, [, v]) => s + parseFloat(v), 0);
            if (totalAlloc > itemQty + 0.001) {
                return { error: `Inward line ${idx + 1}: allocated ${totalAlloc} exceeds received ${itemQty}.`, items: null };
            }
            allocEntries.forEach(([prId, qtyStr]) => {
                out.push({
                    requirement_id: parseInt(prId, 10),
                    qty_received:   parseFloat(qtyStr),
                });
            });
            const remainder = itemQty - totalAlloc;
            if (remainder > 0.001) {
                out.push({ ...rest, qty_received: remainder });
            }
        }
        return { items: out, error: null };
    };

    const handleConfirm = async () => {
        if (!payload?.items) return;
        const { items: outgoing, error } = buildOutgoingItems();
        if (error) { setErr(error); return; }
        setBusy(true); setErr(null);
        try {
            const body = {
                grn_number:    payload.grnNumber || undefined,
                received_date: payload.receivedDate,
                condition:     payload.condition || undefined,
                notes:         payload.notes || undefined,
                items:         outgoing,
            };
            // eslint-disable-next-line no-console
            console.log('[Inward] payload → BE', {
                mode: isCreate ? 'create' : 'update',
                poId, inwardId: inward?.id ?? null,
                scanFile: payload.scanFile?.name ?? null,
                body,
                items: JSON.parse(JSON.stringify(outgoing)),
            });
            const res = isCreate
                ? await purchaseDeptApi.createInward(poId, body, payload.scanFile)
                : await purchaseDeptApi.updateInward(inward.id, body, payload.scanFile);
            setSaved(res.data?.data ?? res.data ?? true);
        } catch (e) {
            setErr(e?.response?.data?.error || e.message || 'Save failed.');
        } finally {
            setBusy(false);
        }
    };

    // After a successful save the parent must still be notified (it refreshes
    // and closes), whether the user clicks Done, the X, or the backdrop.
    const handleDismiss = () => {
        if (saved) onConfirmed?.(saved);
        else onClose?.();
    };

    const savedObj  = saved && typeof saved === 'object' ? saved : null;
    const savedGrn  = savedObj?.grn_number || payload?.grnNumber || null;
    const savedDate = savedObj?.received_date || payload?.receivedDate;

    // Resolve the PR allocations of a summary row for the success screen.
    const allocationsForRow = (idx) => Object.entries(allocations[idx] || {})
        .filter(([, v]) => parseFloat(v) > 0)
        .map(([prId, v]) => {
            const pr = openReqs.find(r => String(r.id) === String(prId));
            const ctx = pr ? [
                pr.order_number && `SO ${pr.order_number}`,
                pr.customer_name,
            ].filter(Boolean).join(' · ') : '';
            return { prId, qty: parseFloat(v), ctx };
        });

    return (
        <div className="fixed inset-0 z-50 bg-white flex flex-col">
            <div className="bg-white w-full h-full flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
                <div className={`flex items-start justify-between gap-3 px-5 py-4 border-b ${saved ? 'border-emerald-100 bg-emerald-50/60' : 'border-slate-100'}`}>
                    <div>
                        <h2 className="text-base font-black text-slate-800 flex items-center gap-2">
                            {saved ? <PartyPopper size={16} className="text-emerald-600" /> : <CheckCircle2 size={16} className="text-emerald-500" />}
                            {saved
                                ? `Inward ${isCreate ? 'recorded' : 'updated'} successfully`
                                : 'Review before saving'}
                        </h2>
                        {(poCode || poId) && (
                            <p className="text-[11px] font-semibold text-emerald-700 mt-0.5">
                                PO · {poCode || `#${poId}`}
                            </p>
                        )}
                        {saved ? (
                            <p className="text-xs text-slate-600 mt-0.5">
                                GRN {savedGrn || (savedObj?.id ? `#${savedObj.id}` : '(auto)')} · dated {savedDate} · {summary.length} line{summary.length !== 1 ? 's' : ''} posted.
                            </p>
                        ) : (
                            <p className="text-xs text-slate-500 mt-0.5">
                                {summary.length} line{summary.length !== 1 ? 's' : ''} will be {isCreate ? 'recorded' : 'updated'} on GRN {payload?.grnNumber || '(auto)'} dated {payload?.receivedDate}.
                            </p>
                        )}
                    </div>
                    <button onClick={handleDismiss} className="p-1.5 hover:bg-slate-100 rounded-full transition shrink-0">
                        <X size={16} className="text-slate-500" />
                    </button>
                </div>

                {saved ? (
                <div className="overflow-auto flex-1 px-5 py-4 space-y-3">
                    <div className="flex flex-wrap gap-2">
                        {savedObj?.id && (
                            <span className="text-[10px] font-bold bg-slate-100 text-slate-600 px-2 py-1 rounded-full">Inward #{savedObj.id}</span>
                        )}
                        {savedGrn && (
                            <span className="text-[10px] font-bold bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full">GRN {savedGrn}</span>
                        )}
                        {savedDate && (
                            <span className="text-[10px] font-bold bg-slate-100 text-slate-600 px-2 py-1 rounded-full">Received {savedDate}</span>
                        )}
                        {payload?.condition && (
                            <span className="text-[10px] font-bold bg-slate-100 text-slate-600 px-2 py-1 rounded-full capitalize">Condition · {payload.condition}</span>
                        )}
                        {payload?.scanFile && (
                            <span className="text-[10px] font-bold bg-blue-50 text-blue-700 px-2 py-1 rounded-full">Scan attached</span>
                        )}
                    </div>

                    <div className="space-y-1.5">
                        {summary.map(row => {
                            const rowAllocs = allocationsForRow(row.idx);
                            return (
                                <div key={row.key} className="bg-white border border-emerald-100 rounded-xl">
                                    <div className="flex items-start gap-3 px-3 py-2">
                                        <CheckCircle2 size={14} className="text-emerald-500 mt-0.5 shrink-0" />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs font-bold text-slate-800">{row.name}</p>
                                            {row.details && (
                                                <p className="text-[11px] text-slate-600 mt-0.5">{row.details}</p>
                                            )}
                                            {row.isTrim && row.variantId && (
                                                <SupplierCodePill supplierId={supplierId} supplierName={supplierName} variantId={row.variantId} className="mt-0.5" />
                                            )}
                                            {row.rolls && row.rolls.length > 0 && (
                                                <ul className="mt-1 text-[10px] text-slate-500 space-y-0.5">
                                                    {row.rolls.map((r, i) => (
                                                        <li key={i} className="font-mono">
                                                            {r.bale_no || '—'} · {Number(r.meter).toLocaleString(undefined, { maximumFractionDigits: 2 })} {r.uom || 'm'}
                                                        </li>
                                                    ))}
                                                </ul>
                                            )}
                                            {row.boxes && row.boxes.length > 0 && (
                                                <p className="mt-1 text-[10px] text-slate-500 font-mono">
                                                    {row.boxes.map(b => `${b.box_count} × ${Number(b.qty_per_box).toLocaleString()}`).join(' + ')}
                                                </p>
                                            )}
                                            {rowAllocs.length > 0 && (
                                                <ul className="mt-1 space-y-0.5">
                                                    {rowAllocs.map(a => (
                                                        <li key={a.prId} className="text-[10px] text-slate-600">
                                                            <span className="font-mono font-bold text-blue-700">PR-{a.prId}</span>
                                                            {' '}← {a.qty.toLocaleString(undefined, { maximumFractionDigits: 2 })} {row.unit}
                                                            {a.ctx && <span className="text-slate-400"> · {a.ctx}</span>}
                                                        </li>
                                                    ))}
                                                </ul>
                                            )}
                                        </div>
                                        <div className="shrink-0 text-right">
                                            <p className="text-sm font-bold text-emerald-700 tabular-nums">
                                                {Number(row.qty || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })} {row.unit}
                                            </p>
                                            {row.rolls && row.rolls.length > 0 && (
                                                <p className="text-[9px] text-slate-400">{row.rolls.length} roll{row.rolls.length !== 1 ? 's' : ''}</p>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {breakdownPanel}

                    {payload?.notes && (
                        <div className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Notes</p>
                            <p className="text-xs text-slate-700 mt-0.5 whitespace-pre-wrap">{payload.notes}</p>
                        </div>
                    )}
                </div>
                ) : (
                <div className="overflow-auto flex-1 px-5 py-4 space-y-3">
                    {err && (
                        <div className="flex items-center gap-2 bg-red-50 border border-red-100 rounded-xl px-3 py-2 text-sm text-red-600">
                            <AlertTriangle size={14} /> {err}
                        </div>
                    )}
                    {loadingOpenReqs && (
                        <p className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                            <Loader2 size={10} className="animate-spin" /> Looking up open purchase requirements…
                        </p>
                    )}

                    <div className="space-y-1.5">
                        {summary.map(row => {
                            const reqs       = pendingReqsByItem[row.idx] || [];
                            const itemAlloc  = allocations[row.idx] || {};
                            const allocTotal = Object.values(itemAlloc).reduce((s, v) => s + (parseFloat(v) || 0), 0);
                            const itemQty    = Number(row.qty || 0);
                            const overAlloc  = allocTotal > itemQty + 0.001;
                            return (
                                <div key={row.key} className={`bg-white border rounded-xl ${overAlloc ? 'border-red-300' : 'border-slate-200'}`}>
                                    <div className="flex items-start gap-3 px-3 py-2">
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs font-bold text-slate-800">{row.name}</p>
                                            {row.details && (
                                                <p className="text-[11px] text-slate-600 mt-0.5">{row.details}</p>
                                            )}
                                            {row.isTrim && row.variantId && (
                                                <SupplierCodePill supplierId={supplierId} supplierName={supplierName} variantId={row.variantId} className="mt-0.5" />
                                            )}
                                            {row.rolls && row.rolls.length > 0 && (
                                                <ul className="mt-1 text-[10px] text-slate-500 space-y-0.5">
                                                    {row.rolls.map((r, i) => (
                                                        <li key={i} className="font-mono">
                                                            {r.bale_no || '—'} · {Number(r.meter).toLocaleString(undefined, { maximumFractionDigits: 2 })} {r.uom || 'm'}
                                                        </li>
                                                    ))}
                                                </ul>
                                            )}
                                            {row.boxes && row.boxes.length > 0 && (
                                                <p className="mt-1 text-[10px] text-slate-500 font-mono">
                                                    {row.boxes.map(b => `${b.box_count} × ${Number(b.qty_per_box).toLocaleString()}`).join(' + ')}
                                                </p>
                                            )}
                                        </div>
                                        <div className="shrink-0 text-right">
                                            <p className="text-sm font-bold text-emerald-700 tabular-nums">
                                                {itemQty.toLocaleString(undefined, { maximumFractionDigits: 2 })} {row.unit}
                                            </p>
                                            {row.rolls && row.rolls.length > 0 && (
                                                <p className="text-[9px] text-slate-400">{row.rolls.length} roll{row.rolls.length !== 1 ? 's' : ''}</p>
                                            )}
                                            {row.boxes && row.boxes.length > 0 && (
                                                <p className="text-[9px] text-slate-400">{row.boxes.reduce((s, b) => s + (parseFloat(b.box_count) || 0), 0)} box{row.boxes.reduce((s, b) => s + (parseFloat(b.box_count) || 0), 0) !== 1 ? 'es' : ''}</p>
                                            )}
                                        </div>
                                    </div>

                                    {reqs.length > 0 && (() => {
                                        const isOpen     = expandedAllocs.has(row.idx);
                                        const allocCount = Object.values(itemAlloc).filter(v => parseFloat(v) > 0).length;
                                        const reqTotal   = reqs.reduce((s, pr) => s + Number(pr.quantity_required ?? pr.quantity ?? pr.meters_required ?? 0), 0);
                                        return (
                                        <div className="border-t border-slate-100 bg-slate-50/60 rounded-b-xl">
                                            {/* Accordion header — always visible */}
                                            <div className="flex items-center justify-between gap-2 px-3 py-2">
                                                <button
                                                    type="button"
                                                    onClick={() => toggleExpandAlloc(row.idx)}
                                                    className="flex items-center gap-1.5 text-[10px] font-bold text-slate-600 uppercase tracking-wider hover:text-slate-800"
                                                >
                                                    <Link2 size={11} />
                                                    Allocate to {reqs.length} pending PR{reqs.length === 1 ? '' : 's'}
                                                    {allocCount > 0 && (
                                                        <span className="ml-1 text-emerald-700 normal-case font-bold">· {allocCount} filled</span>
                                                    )}
                                                    {isOpen ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                                                </button>
                                                <div className="flex items-center gap-1.5 shrink-0">
                                                    <p className={`text-[10px] font-bold tabular-nums ${overAlloc ? 'text-red-600' : allocTotal > 0 ? 'text-emerald-700' : 'text-slate-500'}`}>
                                                        {allocTotal.toLocaleString(undefined, { maximumFractionDigits: 2 })} / {itemQty.toLocaleString(undefined, { maximumFractionDigits: 2 })} {row.unit}
                                                        {overAlloc && <span className="text-red-600 ml-1">· over</span>}
                                                    </p>
                                                    <button
                                                        type="button"
                                                        onClick={() => fillAllReqs(row.idx, reqs, itemQty)}
                                                        title={`Greedy fill across all ${reqs.length} PRs (urgent first). Total required: ${reqTotal.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${row.unit}.`}
                                                        className="flex items-center gap-1 text-[10px] font-bold text-emerald-700 hover:text-white hover:bg-emerald-600 border border-emerald-300 px-2 py-0.5 rounded transition-colors"
                                                    >
                                                        <Zap size={10} /> Fill all
                                                    </button>
                                                    {allocCount > 0 && (
                                                        <button
                                                            type="button"
                                                            onClick={() => clearAllAlloc(row.idx)}
                                                            title="Clear all allocations for this item"
                                                            className="text-[10px] font-bold text-slate-400 hover:text-red-600 px-1.5 py-0.5 rounded"
                                                        >
                                                            clear
                                                        </button>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Expanded list */}
                                            {isOpen && (
                                            <div className="px-3 pb-2 space-y-1.5">
                                                {reqs.map(pr => {
                                                    const reqQty   = Number(pr.quantity_required ?? pr.quantity ?? pr.meters_required ?? 0);
                                                    const cur      = itemAlloc[pr.id] ?? '';
                                                    const fillRest = () => {
                                                        const otherAlloc = Object.entries(itemAlloc)
                                                            .filter(([k]) => String(k) !== String(pr.id))
                                                            .reduce((s, [, v]) => s + (parseFloat(v) || 0), 0);
                                                        const room = Math.max(0, itemQty - otherAlloc);
                                                        const fill = Math.min(reqQty || room, room);
                                                        if (fill > 0) setAllocation(row.idx, pr.id, String(fill));
                                                    };
                                                    const ctxBits = [
                                                        pr.order_number   && `SO ${pr.order_number}`,
                                                        pr.customer_name,
                                                        pr.product_name,
                                                        pr.raised_by_name && `by ${pr.raised_by_name}`,
                                                    ].filter(Boolean).join(' · ');
                                                    return (
                                                        <div key={pr.id} className="bg-white border border-slate-100 rounded-lg px-2 py-1.5">
                                                            <div className="flex items-center gap-2 text-[11px]">
                                                                <span className="font-mono font-bold text-blue-700 shrink-0">PR-{pr.id}</span>
                                                                <span className="text-slate-700 font-bold tabular-nums shrink-0">
                                                                    {reqQty.toLocaleString(undefined, { maximumFractionDigits: 2 })} {row.unit} req'd
                                                                </span>
                                                                {pr.urgency && (
                                                                    <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full shrink-0 ${
                                                                        String(pr.urgency).toLowerCase() === 'urgent' ? 'bg-red-100 text-red-700' : 'bg-amber-50 text-amber-700 border border-amber-200'
                                                                    }`}>
                                                                        {pr.urgency}
                                                                    </span>
                                                                )}
                                                                <button
                                                                    type="button"
                                                                    onClick={fillRest}
                                                                    className="ml-auto text-[9px] font-bold text-blue-600 hover:text-blue-700 underline shrink-0"
                                                                >
                                                                    fill
                                                                </button>
                                                                <input
                                                                    type="number"
                                                                    min="0"
                                                                    step="any"
                                                                    placeholder="0"
                                                                    value={cur}
                                                                    onChange={e => setAllocation(row.idx, pr.id, e.target.value)}
                                                                    className="w-24 text-[11px] border border-slate-200 rounded px-1.5 py-1 text-right tabular-nums focus:outline-none focus:border-emerald-400"
                                                                />
                                                                <span className="text-[10px] text-slate-400 w-8 shrink-0">{row.unit}</span>
                                                            </div>
                                                            {ctxBits && (
                                                                <p className="text-[10px] text-slate-500 mt-0.5 pl-1 truncate">{ctxBits}</p>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                            )}
                                        </div>
                                        );
                                    })()}
                                </div>
                            );
                        })}
                    </div>

                    {breakdownPanel}

                    {payload?.notes && (
                        <div className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Notes</p>
                            <p className="text-xs text-slate-700 mt-0.5 whitespace-pre-wrap">{payload.notes}</p>
                        </div>
                    )}
                </div>
                )}

                <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-100">
                    {saved ? (
                        <button
                            onClick={handleDismiss}
                            className="flex items-center gap-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 px-4 py-1.5 rounded-lg transition shadow-sm"
                        >
                            <CheckCircle2 size={12} /> Done
                        </button>
                    ) : (
                        <>
                            <button
                                onClick={() => onBack?.(payload)}
                                disabled={busy}
                                className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition disabled:opacity-40"
                            >
                                <ArrowLeft size={12} /> Back to edit
                            </button>
                            <button
                                onClick={handleConfirm}
                                disabled={busy}
                                className="flex items-center gap-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 px-4 py-1.5 rounded-lg transition shadow-sm"
                            >
                                {busy && <Loader2 size={12} className="animate-spin" />}
                                {isCreate ? 'Confirm & Save' : 'Confirm changes'}
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

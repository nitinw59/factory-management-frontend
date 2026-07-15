import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { trimKitsApi } from '../../api/trimKitsApi';
import { storeManagerApi } from '../../api/storeManagerApi';
import { useAuth } from '../../context/AuthContext';
import SearchableSelect from '../../shared/SearchableSelect';
import { exchangeStatusOf } from './kitStatusConfig';
import {
    Loader2, ArrowLeftRight, Plus, X, Trash2, ArrowDownLeft, ArrowUpRight,
    AlertTriangle, CheckCircle2, PenLine, Ban, RefreshCw
} from 'lucide-react';

const fmtDateTime = (d) => d ? new Date(d).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
const variantText = (v) =>
    [`${v.color_number ? `${v.color_number} - ` : ''}${v.color_name || ''}`.trim(), v.variant_size].filter(Boolean).join(' / ') || `#${v.trim_item_variant_id || v.variant_id}`;

// ── Create modal (store prepares the swap) ───────────────────────────────────
const CreateExchangeModal = ({ orderId, custodyVariants, onClose, onCreated }) => {
    const [reason, setReason] = useState('');
    const [returnQtys, setReturnQtys] = useState({}); // { variant_id: qty }
    const [issues, setIssues] = useState([]);          // [{ trim_item_variant_id, label, qty }]
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState(null);

    // Issue picker
    const [trimItems, setTrimItems] = useState([]);
    const [pickItemId, setPickItemId] = useState('');
    const [variants, setVariants] = useState([]);
    const [loadingVariants, setLoadingVariants] = useState(false);
    const [pickVariantId, setPickVariantId] = useState('');
    const [pickQty, setPickQty] = useState('');

    useEffect(() => {
        storeManagerApi.getAllTrimItems().then(r => setTrimItems(r.data || [])).catch(() => setTrimItems([]));
    }, []);

    useEffect(() => {
        if (!pickItemId) { setVariants([]); setPickVariantId(''); return; }
        setLoadingVariants(true);
        storeManagerApi.getVariantsByTrimItem(pickItemId)
            .then(r => setVariants(r.data || []))
            .catch(() => setVariants([]))
            .finally(() => setLoadingVariants(false));
    }, [pickItemId]);

    const setReturnQty = (vid, raw) => {
        setReturnQtys(prev => ({ ...prev, [vid]: raw }));
    };

    const returnLines = useMemo(() =>
        custodyVariants
            .map(cv => ({ cv, qty: parseInt(returnQtys[cv.variant_id], 10) || 0 }))
            .filter(r => r.qty > 0),
        [custodyVariants, returnQtys]
    );

    const addIssue = () => {
        if (!pickVariantId || !(parseInt(pickQty, 10) > 0)) return;
        const v = variants.find(x => String(x.variant_id) === String(pickVariantId));
        if (!v) return;
        if (issues.some(i => String(i.trim_item_variant_id) === String(pickVariantId))) {
            setError('That variant is already in the issue list — edit or remove it first.');
            return;
        }
        setIssues(prev => [...prev, {
            trim_item_variant_id: v.variant_id,
            label: `${v.item_name || ''} — ${variantText(v)}`.trim(),
            stock: v.main_store_stock,
            qty: parseInt(pickQty, 10),
        }]);
        setPickVariantId(''); setPickQty(''); setError(null);
    };

    const removeIssue = (vid) => setIssues(prev => prev.filter(i => String(i.trim_item_variant_id) !== String(vid)));

    // Validation: ≥1 return line, no over-return, integer qtys.
    const overReturn = returnLines.find(r => r.qty > r.cv.custody_qty);
    const canSubmit = returnLines.length > 0 && !overReturn && !submitting;

    const handleSubmit = async () => {
        if (!canSubmit) return;
        setSubmitting(true);
        setError(null);
        try {
            const payload = {
                reason: reason.trim() || undefined,
                returns: returnLines.map(r => ({ trim_item_variant_id: r.cv.variant_id, qty: r.qty })),
                issues: issues.map(i => ({ trim_item_variant_id: i.trim_item_variant_id, qty: i.qty })),
            };
            const res = await trimKitsApi.createExchange(orderId, payload);
            console.log('[trimkits] createExchange raw:', res.data);
            onCreated(res.data);
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to create exchange.');
        } finally {
            setSubmitting(false);
        }
    };

    return createPortal(
        <div className="fixed inset-0 bg-white z-[600] flex flex-col">
            {/* Top bar */}
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-indigo-100 rounded-lg"><ArrowLeftRight className="w-5 h-5 text-indigo-600" /></div>
                    <div>
                        <h2 className="text-lg font-extrabold text-gray-900">New Exchange</h2>
                        <p className="text-xs text-gray-500 font-medium">Return trims from the loader and (optionally) issue replacements. The loader signs to execute it.</p>
                    </div>
                </div>
                <button onClick={() => !submitting && onClose()} className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg" title="Close"><X className="w-5 h-5" /></button>
            </div>

            {/* Reason — spans the full width */}
            <div className="px-6 py-3 border-b border-gray-100 shrink-0">
                <label className="text-[10px] uppercase tracking-wider font-bold text-gray-400">Reason (optional)</label>
                <input
                    type="text"
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                    placeholder="e.g. line needs black + white"
                    className="mt-1 w-full border border-gray-300 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                />
            </div>

            {/* Two panes: returns (left) · issue replacement (right) */}
            <div className="flex-1 min-h-0 grid grid-cols-1 grid-rows-2 lg:grid-cols-2 lg:grid-rows-1 lg:divide-x divide-gray-200">
                {/* LEFT — Return from loader */}
                <div className="flex flex-col min-h-0 overflow-hidden">
                    <div className="px-6 py-3 bg-rose-50/60 border-b border-gray-100 shrink-0 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <ArrowDownLeft className="w-4 h-4 text-rose-600" />
                            <h3 className="text-sm font-bold text-gray-800">Return from loader <span className="text-rose-600">*</span></h3>
                        </div>
                        {returnLines.length > 0 && <span className="text-[10px] uppercase tracking-wider font-bold text-rose-700 bg-rose-100 border border-rose-200 rounded-full px-2 py-0.5">{returnLines.length} line{returnLines.length === 1 ? '' : 's'}</span>}
                    </div>
                    <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4">
                        {custodyVariants.length === 0 ? (
                            <p className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg p-3">The loader isn't holding anything on this order yet.</p>
                        ) : (
                            <div className="space-y-1.5">
                                {custodyVariants.map(cv => {
                                    const qv = returnQtys[cv.variant_id] ?? '';
                                    const over = (parseInt(qv, 10) || 0) > cv.custody_qty;
                                    return (
                                        <div key={cv.variant_id} className={`flex items-center gap-3 border rounded-lg px-3 py-2 ${(parseInt(qv, 10) || 0) > 0 ? 'bg-rose-50 border-rose-200' : 'bg-gray-50 border-gray-200'}`}>
                                            <div className="min-w-0 flex-1">
                                                <p className="text-sm font-semibold text-gray-800 truncate">{cv.item_name}</p>
                                                <p className="text-xs text-gray-500">{variantText(cv)} · <span className="font-mono">{cv.custody_qty} held</span></p>
                                            </div>
                                            <input
                                                type="number"
                                                min="0"
                                                max={cv.custody_qty}
                                                step="1"
                                                value={qv}
                                                onChange={e => setReturnQty(cv.variant_id, e.target.value)}
                                                onWheel={e => e.target.blur()}
                                                placeholder="0"
                                                className={`w-24 text-center border rounded-lg p-2 outline-none font-bold text-sm focus:ring-2 ${over ? 'border-red-400 bg-red-50 text-red-700 focus:ring-red-400' : 'border-gray-300 focus:ring-indigo-500'}`}
                                            />
                                        </div>
                                    );
                                })}
                                {overReturn && <p className="text-xs font-bold text-red-600 mt-1">Cannot return more than the loader holds.</p>}
                            </div>
                        )}
                    </div>
                </div>

                {/* RIGHT — Issue replacement */}
                <div className="flex flex-col min-h-0 overflow-hidden border-t lg:border-t-0 border-gray-200">
                    <div className="px-6 py-3 bg-emerald-50/60 border-b border-gray-100 shrink-0 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <ArrowUpRight className="w-4 h-4 text-emerald-600" />
                            <h3 className="text-sm font-bold text-gray-800">Issue replacement <span className="text-gray-400 font-medium">(optional)</span></h3>
                        </div>
                        {issues.length > 0 && <span className="text-[10px] uppercase tracking-wider font-bold text-emerald-700 bg-emerald-100 border border-emerald-200 rounded-full px-2 py-0.5">{issues.length} line{issues.length === 1 ? '' : 's'}</span>}
                    </div>
                    <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto_auto] gap-2 items-end bg-gray-50 border border-gray-200 rounded-lg p-3">
                            <div>
                                <label className="text-[10px] uppercase tracking-wider font-bold text-gray-400">Trim item</label>
                                <SearchableSelect
                                    value={pickItemId}
                                    onChange={setPickItemId}
                                    options={trimItems.map(it => ({ value: it.id, label: `${it.name}${it.brand ? ` - ${it.brand}` : ''}` }))}
                                    placeholder="Choose item…"
                                    size="base"
                                    accentColor="violet"
                                />
                            </div>
                            <div>
                                <label className="text-[10px] uppercase tracking-wider font-bold text-gray-400">Variant</label>
                                <SearchableSelect
                                    value={pickVariantId}
                                    onChange={setPickVariantId}
                                    disabled={!pickItemId || loadingVariants}
                                    options={variants.map(v => ({ value: v.variant_id, label: `${variantText(v)} · stock ${v.main_store_stock}` }))}
                                    placeholder={loadingVariants ? 'Loading…' : 'Choose variant…'}
                                    size="base"
                                    accentColor="violet"
                                />
                            </div>
                            <div>
                                <label className="text-[10px] uppercase tracking-wider font-bold text-gray-400">Qty</label>
                                <input
                                    type="number"
                                    min="1"
                                    step="1"
                                    value={pickQty}
                                    onChange={e => setPickQty(e.target.value)}
                                    onWheel={e => e.target.blur()}
                                    className="w-20 border border-gray-300 rounded-lg p-2 text-center text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                                />
                            </div>
                            <button
                                onClick={addIssue}
                                disabled={!pickVariantId || !(parseInt(pickQty, 10) > 0)}
                                className="flex items-center px-3 py-2 bg-gray-900 text-white rounded-lg text-sm font-bold hover:bg-black disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                <Plus className="w-4 h-4 mr-1" /> Add
                            </button>
                        </div>
                        {issues.length > 0 ? (
                            <div className="space-y-1.5">
                                {issues.map(i => (
                                    <div key={i.trim_item_variant_id} className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                                        <span className="text-sm text-gray-800 truncate">
                                            <span className="font-mono font-bold bg-white border border-emerald-200 px-1.5 rounded mr-2">{i.qty}×</span>
                                            {i.label}
                                            {Number(i.stock) < i.qty && <span className="ml-2 text-[10px] uppercase font-bold text-amber-700 bg-amber-100 border border-amber-200 px-1 rounded">stock {i.stock}</span>}
                                        </span>
                                        <button onClick={() => removeIssue(i.trim_item_variant_id)} className="text-gray-400 hover:text-red-600 p-1"><Trash2 className="w-4 h-4" /></button>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-xs text-gray-400">No replacement lines — a pure return is fine.</p>
                        )}
                    </div>
                </div>
            </div>

            {/* Footer */}
            <div className="border-t border-gray-200 shrink-0">
                {error && (
                    <div className="mx-6 mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 font-medium flex items-start">
                        <AlertTriangle className="w-4 h-4 mr-2 shrink-0 mt-0.5" /> {error}
                    </div>
                )}
                <div className="px-6 py-4 flex items-center justify-between gap-3">
                    <p className="text-xs text-gray-500 font-medium">Stock for issued items must be available before the loader signs.</p>
                    <div className="flex gap-2 shrink-0">
                        <button onClick={onClose} disabled={submitting} className="px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg font-bold text-sm hover:bg-gray-200 disabled:opacity-50">Cancel</button>
                        <button onClick={handleSubmit} disabled={!canSubmit} className="px-5 py-2.5 bg-indigo-600 text-white rounded-lg font-bold text-sm hover:bg-indigo-700 disabled:opacity-50 flex items-center">
                            {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ArrowLeftRight className="w-4 h-4 mr-2" />}
                            Create Exchange
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
};

// ── Panel (list + role actions) ──────────────────────────────────────────────
const ExchangePanel = ({ orderId, custodyVariants = [], onChanged }) => {
    const { user } = useAuth();
    const isStore = ['store_manager', 'factory_admin'].includes(user?.role);
    const isLoader = ['line_loader', 'factory_admin'].includes(user?.role);

    const [exchanges, setExchanges] = useState(null);
    const [createOpen, setCreateOpen] = useState(false);
    const [busyId, setBusyId] = useState(null);
    const [msg, setMsg] = useState(null); // { kind: 'success'|'error', text }

    const fetchExchanges = useCallback(async () => {
        try {
            const res = await trimKitsApi.getExchanges(orderId);
            console.log('[trimkits] getExchanges raw:', res.data);
            setExchanges(res.data || []);
        } catch (err) {
            setExchanges([]);
        }
    }, [orderId]);

    useEffect(() => { fetchExchanges(); }, [fetchExchanges]);

    const refreshAll = useCallback(async () => {
        await fetchExchanges();
        if (onChanged) await onChanged();
    }, [fetchExchanges, onChanged]);

    const handleCreated = async (data) => {
        setCreateOpen(false);
        const warn = (data?.warnings || []).length ? ` ${data.warnings.join(' ')}` : '';
        setMsg({ kind: 'success', text: `${data?.exchange_number || 'Exchange'} created — awaiting loader signature.${warn}` });
        await refreshAll();
    };

    const handleSign = async (ex) => {
        if (!window.confirm(`Sign ${ex.exchange_number}? Returns re-enter stock and any replacements are issued to you — this executes immediately.`)) return;
        setBusyId(ex.id);
        setMsg(null);
        try {
            const res = await trimKitsApi.signExchange(ex.id);
            const d = res.data || {};
            console.log('[trimkits] signExchange raw:', d);
            const slip = d.issue?.issue_number ? ` Slip ${d.issue.issue_number}.` : '';
            setMsg({ kind: 'success', text: `${d.exchange_number || ex.exchange_number} signed — stock and custody updated.${slip}` });
            await refreshAll();
        } catch (err) {
            const d = err.response?.data || {};
            if (d.available !== undefined && d.needed !== undefined) {
                setMsg({ kind: 'error', text: `Stock shortfall on a replacement (available ${d.available}, needed ${d.needed}). Ask the store to fix stock, then sign again.` });
            } else if (d.returnable !== undefined && d.requested !== undefined) {
                setMsg({ kind: 'error', text: `Custody changed since this was prepared (you hold ${d.returnable}, it asks to return ${d.requested}). The store must cancel and recreate it.` });
            } else {
                setMsg({ kind: 'error', text: d.error || 'Failed to sign exchange.' });
            }
            await fetchExchanges();
        } finally {
            setBusyId(null);
        }
    };

    const handleCancel = async (ex) => {
        if (!window.confirm(`Cancel ${ex.exchange_number}? The loader will no longer be able to sign it.`)) return;
        setBusyId(ex.id);
        setMsg(null);
        try {
            await trimKitsApi.cancelExchange(ex.id);
            setMsg({ kind: 'success', text: `${ex.exchange_number} cancelled.` });
            await refreshAll();
        } catch (err) {
            setMsg({ kind: 'error', text: err.response?.data?.error || 'Failed to cancel exchange.' });
            await fetchExchanges();
        } finally {
            setBusyId(null);
        }
    };

    const list = exchanges || [];

    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
                <div className="flex items-center">
                    <ArrowLeftRight className="w-4 h-4 mr-2 text-indigo-600" />
                    <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider">Exchanges</h3>
                    <span className="ml-2 text-xs text-gray-400 font-medium">swap trims already with the loader</span>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={fetchExchanges} className="p-1.5 text-gray-400 hover:text-gray-700 rounded" title="Refresh"><RefreshCw className="w-4 h-4" /></button>
                    {isStore && (
                        <button
                            onClick={() => { setMsg(null); setCreateOpen(true); }}
                            className="flex items-center px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700"
                        >
                            <Plus className="w-3.5 h-3.5 mr-1" /> New Exchange
                        </button>
                    )}
                </div>
            </div>

            {msg && (
                <div className={`mx-4 mt-3 p-3 rounded-lg text-sm font-medium flex items-start ${msg.kind === 'error' ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200'}`}>
                    {msg.kind === 'error' ? <AlertTriangle className="w-4 h-4 mr-2 shrink-0 mt-0.5" /> : <CheckCircle2 className="w-4 h-4 mr-2 shrink-0 mt-0.5" />}
                    <span className="flex-1">{msg.text}</span>
                    <button onClick={() => setMsg(null)} className="ml-2 opacity-60 hover:opacity-100"><X className="w-3.5 h-3.5" /></button>
                </div>
            )}

            <div className="p-4">
                {/* Loaders can't raise exchanges (the store prepares them) — tell them how to get one started. */}
                {isLoader && !isStore && (
                    <div className="mb-3 p-3 bg-indigo-50 border border-indigo-200 rounded-lg text-xs text-indigo-800 font-medium flex items-start">
                        <ArrowLeftRight className="w-4 h-4 mr-2 shrink-0 mt-0.5" />
                        Got a wrong or damaged trim? Ask the store to raise an exchange for this batch — it'll appear here for you to sign.
                    </div>
                )}
                {exchanges === null ? (
                    <div className="flex justify-center py-6"><Loader2 className="animate-spin h-6 w-6 text-indigo-600" /></div>
                ) : list.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-6 font-medium">No exchanges on this order.</p>
                ) : (
                    <div className="space-y-3">
                        {list.map(ex => {
                            const meta = exchangeStatusOf(ex.status);
                            const returns = (ex.lines || []).filter(l => l.direction === 'RETURN');
                            const issues = (ex.lines || []).filter(l => l.direction === 'ISSUE');
                            const pending = ex.status === 'PENDING_SIGNATURE';
                            return (
                                <div key={ex.id} className="border border-gray-200 rounded-xl overflow-hidden">
                                    <div className="bg-gray-50 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <span className="font-mono font-bold text-gray-800">{ex.exchange_number}</span>
                                            <span className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full border ${meta.badge}`}>{meta.label}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {pending && isLoader && (
                                                <button onClick={() => handleSign(ex)} disabled={busyId === ex.id} className="flex items-center px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-bold hover:bg-green-700 disabled:opacity-50">
                                                    {busyId === ex.id ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <PenLine className="w-3.5 h-3.5 mr-1" />} Sign
                                                </button>
                                            )}
                                            {pending && isStore && (
                                                <button onClick={() => handleCancel(ex)} disabled={busyId === ex.id} className="flex items-center px-3 py-1.5 bg-white text-gray-600 border border-gray-300 rounded-lg text-xs font-bold hover:bg-gray-100 disabled:opacity-50">
                                                    <Ban className="w-3.5 h-3.5 mr-1" /> Cancel
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                    <div className="px-4 py-3">
                                        {ex.reason && <p className="text-xs text-gray-500 italic mb-2">“{ex.reason}”</p>}
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                            <div>
                                                <p className="text-[10px] uppercase tracking-wider font-bold text-rose-600 mb-1 flex items-center"><ArrowDownLeft className="w-3 h-3 mr-1" /> Returned</p>
                                                {returns.length === 0 ? <p className="text-xs text-gray-400">—</p> : returns.map(l => (
                                                    <p key={l.id} className="text-xs text-gray-700"><span className="font-mono font-bold">{l.qty}×</span> {l.item_name} — {variantText(l)}</p>
                                                ))}
                                            </div>
                                            <div>
                                                <p className="text-[10px] uppercase tracking-wider font-bold text-emerald-600 mb-1 flex items-center"><ArrowUpRight className="w-3 h-3 mr-1" /> Issued</p>
                                                {issues.length === 0 ? <p className="text-xs text-gray-400">— (pure return)</p> : issues.map(l => (
                                                    <p key={l.id} className="text-xs text-gray-700"><span className="font-mono font-bold">{l.qty}×</span> {l.item_name} — {variantText(l)}</p>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="mt-2 pt-2 border-t border-gray-100 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-gray-400 font-medium">
                                            {ex.created_by_name && <span>Prepared by {ex.created_by_name}</span>}
                                            {ex.signed_by_name && <span>Signed by {ex.signed_by_name} · {fmtDateTime(ex.signed_at)}</span>}
                                            {ex.issue_number && <span>Slip {ex.issue_number}</span>}
                                            {ex.bill_number && <span>Bill {ex.bill_number}</span>}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {createOpen && (
                <CreateExchangeModal
                    orderId={orderId}
                    custodyVariants={custodyVariants}
                    onClose={() => setCreateOpen(false)}
                    onCreated={handleCreated}
                />
            )}
        </div>
    );
};

export default ExchangePanel;

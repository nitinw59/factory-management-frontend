import React, { useEffect, useState, useCallback } from 'react';
import { Loader2, Tag, Plus, Check, X, AlertTriangle } from 'lucide-react';
import { trimsApi } from '../../api/trimsApi';

const cache = new Map();
const keyOf = (sid, vid) => `${sid}::${vid}`;

export const invalidateSupplierCodeCache = (supplierId, variantId) => {
    if (supplierId == null || variantId == null) return;
    cache.delete(keyOf(supplierId, variantId));
};

const SupplierCodePill = ({ supplierId, supplierName, variantId, className = '' }) => {
    const enabled = !!(supplierId && variantId);
    const cacheKey = enabled ? keyOf(supplierId, variantId) : null;

    const [status, setStatus] = useState('idle');
    const [code, setCode] = useState(null);
    const [adding, setAdding] = useState(false);
    const [draft, setDraft] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);

    const load = useCallback(async () => {
        if (!enabled) { setStatus('idle'); setCode(null); return; }
        if (cache.has(cacheKey)) {
            const cached = cache.get(cacheKey);
            setStatus(cached.code ? 'found' : 'missing');
            setCode(cached.code);
            return;
        }
        setStatus('loading');
        try {
            const r = await trimsApi.getVariantSupplierCodes(variantId, { supplier_id: supplierId });
            const row = Array.isArray(r.data) ? r.data[0] : (r.data?.data?.[0] ?? null);
            const c = row?.supplier_color_code ?? row?.code ?? null;
            cache.set(cacheKey, { code: c });
            setStatus(c ? 'found' : 'missing');
            setCode(c);
        } catch {
            setStatus('missing');
            setCode(null);
        }
    }, [enabled, cacheKey, supplierId, variantId]);

    useEffect(() => { load(); }, [load]);

    const startAdd = (e) => {
        e?.stopPropagation?.();
        setAdding(true);
        setDraft('');
        setError(null);
    };
    const cancelAdd = (e) => {
        e?.stopPropagation?.();
        setAdding(false);
        setDraft('');
        setError(null);
    };
    const saveAdd = async (e) => {
        e?.stopPropagation?.();
        const value = draft.trim();
        if (!value) { setError('Code required.'); return; }
        setSaving(true);
        setError(null);
        try {
            await trimsApi.upsertVariantSupplierCode(variantId, {
                supplier_id: Number(supplierId),
                supplier_color_code: value,
                supplier_color_notes: null,
            });
            cache.set(cacheKey, { code: value });
            setCode(value);
            setStatus('found');
            setAdding(false);
            setDraft('');
        } catch (err) {
            setError(err?.response?.data?.error || 'Save failed.');
        } finally {
            setSaving(false);
        }
    };

    if (!enabled) return null;

    if (status === 'loading') {
        return (
            <span className={`inline-flex items-center gap-1 text-[10px] text-slate-400 ${className}`}>
                <Loader2 size={10} className="animate-spin" /> looking up {supplierName || 'supplier'} code…
            </span>
        );
    }

    if (status === 'found') {
        return (
            <span
                className={`inline-flex items-center gap-1 text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded ${className}`}
                title={`${supplierName || 'Supplier'} catalog code`}
            >
                <Tag size={10} />
                <span className="font-normal text-emerald-600">{supplierName || 'Supplier'}:</span>
                <span className="font-mono">{code}</span>
            </span>
        );
    }

    // status === 'missing' — show the inline CTA / add form
    if (adding) {
        return (
            <span className={`inline-flex items-center gap-1 text-[10px] ${className}`}>
                <input
                    autoFocus
                    type="text"
                    value={draft}
                    onChange={e => setDraft(e.target.value)}
                    onKeyDown={e => {
                        if (e.key === 'Enter') saveAdd(e);
                        if (e.key === 'Escape') cancelAdd(e);
                    }}
                    placeholder={`${supplierName || 'Supplier'}'s code`}
                    disabled={saving}
                    className="w-28 text-[10px] font-mono border border-indigo-300 rounded px-1 py-0.5 focus:outline-none focus:border-indigo-500"
                />
                <button
                    type="button"
                    onClick={saveAdd}
                    disabled={saving}
                    title="Save"
                    className="p-0.5 text-emerald-600 hover:bg-emerald-50 rounded disabled:opacity-40"
                >
                    {saving ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                </button>
                <button
                    type="button"
                    onClick={cancelAdd}
                    disabled={saving}
                    title="Cancel"
                    className="p-0.5 text-slate-500 hover:bg-slate-100 rounded disabled:opacity-40"
                >
                    <X size={11} />
                </button>
                {error && (
                    <span className="text-[10px] text-rose-600 inline-flex items-center gap-1">
                        <AlertTriangle size={10} /> {error}
                    </span>
                )}
            </span>
        );
    }

    return (
        <button
            type="button"
            onClick={startAdd}
            className={`inline-flex items-center gap-1 text-[10px] font-medium text-indigo-600 hover:bg-indigo-50 border border-dashed border-indigo-200 px-1.5 py-0.5 rounded transition ${className}`}
            title={`No ${supplierName || 'supplier'} code on file for this variant yet — click to add one`}
        >
            <Plus size={10} /> Add {supplierName || 'supplier'} code
        </button>
    );
};

export default SupplierCodePill;

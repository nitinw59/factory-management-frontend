import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    LuTag, LuPlus, LuPencil, LuTrash2, LuClipboardPaste, LuSearch, LuCheck, LuX,
    LuLoader, LuTriangleAlert, LuPackage, LuStore,
} from 'react-icons/lu';
import { trimsApi } from '../../api/trimsApi';
import { storeManagerApi } from '../../api/storeManagerApi';

const parseCSVRow = (str) => {
    const result = [];
    let cur = '';
    let inQuote = false;
    for (let i = 0; i < str.length; i++) {
        if (inQuote) {
            if (str[i] === '"') {
                if (i < str.length - 1 && str[i + 1] === '"') { cur += '"'; i++; }
                else { inQuote = false; }
            } else { cur += str[i]; }
        } else {
            if (str[i] === '"') { inQuote = true; }
            else if (str[i] === ',' || str[i] === '\t') { result.push(cur); cur = ''; }
            else { cur += str[i]; }
        }
    }
    result.push(cur);
    return result.map(s => s.trim());
};

const parseClipboard = (text) => {
    const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');
    if (lines.length < 2) return { headers: [], rows: [] };
    const headers = parseCSVRow(lines[0]).map(h => h.toLowerCase().replace(/\s+/g, '_'));
    const rows = lines.slice(1).map(line => {
        const values = parseCSVRow(line);
        return headers.reduce((obj, h, i) => { obj[h] = values[i] ?? ''; return obj; }, {});
    });
    return { headers, rows };
};

const Toast = ({ message, onDone }) => {
    useEffect(() => {
        if (!message) return;
        const t = setTimeout(onDone, 3500);
        return () => clearTimeout(t);
    }, [message, onDone]);
    if (!message) return null;
    return (
        <div className="fixed bottom-6 right-6 z-[60] bg-slate-800 text-white px-4 py-3 rounded-lg shadow-lg text-sm">
            {message}
        </div>
    );
};

const Spinner = ({ className = '' }) => (
    <LuLoader className={`animate-spin h-5 w-5 text-slate-400 ${className}`} />
);

const SegmentedToggle = ({ value, onChange }) => (
    <div className="inline-flex bg-slate-100 rounded-lg p-1 text-sm font-medium">
        <button
            type="button"
            onClick={() => onChange('supplier')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition ${value === 'supplier' ? 'bg-white shadow text-slate-900' : 'text-slate-600 hover:text-slate-900'}`}
        >
            <LuStore size={14} /> By Supplier
        </button>
        <button
            type="button"
            onClick={() => onChange('variant')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition ${value === 'variant' ? 'bg-white shadow text-slate-900' : 'text-slate-600 hover:text-slate-900'}`}
        >
            <LuPackage size={14} /> By Variant
        </button>
    </div>
);

const variantLabel = (v) => {
    if (!v) return '';
    const color = v.color_name || v.variant_color_name || '';
    const num = v.color_number || v.variant_color_number || '';
    const size = v.variant_size || v.size || '';
    const parts = [color, num && `#${num}`, size].filter(Boolean);
    return parts.join(' · ');
};

const itemLabel = (it) => {
    if (!it) return '';
    const name = it.name || it.trim_item_name || '';
    const code = it.item_code || it.trim_item_code || '';
    return code ? `${name} (${code})` : name;
};

const BulkPasteModal = ({ supplier, items, onClose, onApply }) => {
    const [text, setText] = useState('');
    const [parsed, setParsed] = useState(null);
    const [variantCache, setVariantCache] = useState({});
    const [resolving, setResolving] = useState(false);
    const [applying, setApplying] = useState(false);
    const [progress, setProgress] = useState({ done: 0, total: 0 });

    const itemByCode = useMemo(() => {
        const m = new Map();
        for (const it of items) {
            if (it.item_code) m.set(String(it.item_code).toLowerCase(), it);
        }
        return m;
    }, [items]);

    const handlePreview = async () => {
        setResolving(true);
        const { rows } = parseClipboard(text);
        const seen = new Set();
        const resolved = [];
        const itemIdsNeeded = new Set();

        for (const r of rows) {
            const itemCode = String(r.item_code || '').toLowerCase();
            const item = itemByCode.get(itemCode);
            if (item) itemIdsNeeded.add(item.id);
        }

        const nextCache = { ...variantCache };
        await Promise.all(
            [...itemIdsNeeded].filter(id => !nextCache[id]).map(async id => {
                try {
                    const res = await trimsApi.getVariants(id);
                    nextCache[id] = res.data || [];
                } catch {
                    nextCache[id] = [];
                }
            })
        );
        setVariantCache(nextCache);

        for (const r of rows) {
            const itemCode = String(r.item_code || '').trim();
            const colorNumber = String(r.color_number || '').trim();
            const supplierCode = String(r.supplier_code || '').trim();
            const notes = String(r.notes || '').trim() || null;

            if (!itemCode || !colorNumber || !supplierCode) {
                resolved.push({ ...r, status: 'error', reason: 'missing item_code, color_number or supplier_code' });
                continue;
            }
            const item = itemByCode.get(itemCode.toLowerCase());
            if (!item) {
                resolved.push({ ...r, status: 'error', reason: `item_code "${itemCode}" not found` });
                continue;
            }
            const variants = nextCache[item.id] || [];
            const variant = variants.find(v =>
                String(v.color_number || '').toLowerCase() === colorNumber.toLowerCase()
            );
            if (!variant) {
                resolved.push({ ...r, status: 'error', reason: `no variant #${colorNumber} under ${item.name}` });
                continue;
            }
            const dedupKey = `${item.id}::${variant.id}`;
            if (seen.has(dedupKey)) {
                resolved.push({ ...r, status: 'error', reason: 'duplicate row in paste' });
                continue;
            }
            seen.add(dedupKey);
            resolved.push({
                ...r,
                status: 'ok',
                item, variant,
                supplier_code: supplierCode,
                notes,
            });
        }
        setParsed(resolved);
        setResolving(false);
    };

    const okRows = (parsed || []).filter(r => r.status === 'ok');

    const handleApply = async () => {
        if (!okRows.length) return;
        setApplying(true);
        setProgress({ done: 0, total: okRows.length });
        let success = 0;
        for (let i = 0; i < okRows.length; i++) {
            const r = okRows[i];
            try {
                await trimsApi.upsertVariantSupplierCode(r.variant.id, {
                    supplier_id: supplier.id,
                    supplier_color_code: r.supplier_code,
                    supplier_color_notes: r.notes,
                });
                success++;
            } catch {
                // swallow individual row errors; final count reflects success
            }
            setProgress({ done: i + 1, total: okRows.length });
        }
        setApplying(false);
        onApply(success);
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex justify-center items-start pt-12" onClick={onClose}>
            <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="p-4 border-b flex items-center justify-between">
                    <div>
                        <h2 className="text-lg font-semibold text-slate-900">Paste Catalog for {supplier.name}</h2>
                        <p className="text-xs text-slate-500 mt-0.5">
                            TSV or CSV from Excel. Header row required. Columns: <code>item_code</code>, <code>color_number</code>, <code>supplier_code</code>, <code>notes</code> (optional).
                        </p>
                    </div>
                    <button onClick={onClose} className="p-1 text-slate-500 hover:text-slate-800"><LuX size={20} /></button>
                </div>

                <div className="p-4 overflow-y-auto flex-1 space-y-4">
                    <textarea
                        value={text}
                        onChange={e => setText(e.target.value)}
                        rows={8}
                        placeholder={`item_code\tcolor_number\tsupplier_code\tnotes\nZIP-5\tCOL-204\t0900\t\nZIP-5\tCOL-200\t0901\tmatte`}
                        className="w-full p-3 border rounded font-mono text-xs focus:ring-2 focus:ring-indigo-400 outline-none"
                    />
                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={handlePreview}
                            disabled={!text.trim() || resolving}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded disabled:opacity-50"
                        >
                            {resolving ? 'Resolving…' : 'Preview'}
                        </button>
                        {parsed && (
                            <div className="text-sm text-slate-600">
                                <span className="font-semibold text-emerald-700">{okRows.length} ready</span>
                                {' · '}
                                <span className="text-rose-700">{parsed.length - okRows.length} with errors</span>
                            </div>
                        )}
                    </div>

                    {parsed && parsed.length > 0 && (
                        <div className="border rounded overflow-hidden">
                            <table className="w-full text-xs">
                                <thead className="bg-slate-50">
                                    <tr className="text-left text-slate-600">
                                        <th className="p-2 w-8">#</th>
                                        <th className="p-2">Item</th>
                                        <th className="p-2">Variant</th>
                                        <th className="p-2">Code</th>
                                        <th className="p-2">Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {parsed.map((r, idx) => (
                                        <tr key={idx} className={`border-t ${r.status === 'ok' ? '' : 'bg-rose-50'}`}>
                                            <td className="p-2 text-slate-400">{idx + 1}</td>
                                            <td className="p-2">
                                                {r.status === 'ok' ? itemLabel(r.item) : (r.item_code || '—')}
                                            </td>
                                            <td className="p-2">
                                                {r.status === 'ok' ? variantLabel(r.variant) : (r.color_number || '—')}
                                            </td>
                                            <td className="p-2 font-mono">{r.supplier_code || r.code || '—'}</td>
                                            <td className="p-2">
                                                {r.status === 'ok'
                                                    ? <span className="text-emerald-700 inline-flex items-center gap-1"><LuCheck size={12} /> ready</span>
                                                    : <span className="text-rose-700 inline-flex items-center gap-1"><LuTriangleAlert size={12} /> {r.reason}</span>}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                <div className="p-4 border-t flex justify-between items-center bg-slate-50">
                    {applying ? (
                        <div className="text-sm text-slate-600">Applying {progress.done} / {progress.total}…</div>
                    ) : <span />}
                    <div className="flex gap-2">
                        <button onClick={onClose} className="text-sm px-4 py-2 border rounded text-slate-600 hover:bg-white">Cancel</button>
                        <button
                            onClick={handleApply}
                            disabled={!okRows.length || applying}
                            className="text-sm px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded disabled:opacity-50"
                        >
                            Apply {okRows.length} mapping{okRows.length === 1 ? '' : 's'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

const SupplierColorCodesPage = () => {
    const [mode, setMode] = useState(() =>
        (typeof window !== 'undefined' && window.localStorage?.getItem('supplierCodes.mode')) || 'supplier'
    );
    const setModePersist = (m) => {
        setMode(m);
        try { window.localStorage?.setItem('supplierCodes.mode', m); } catch {}
    };

    const [suppliers, setSuppliers] = useState([]);
    const [items, setItems] = useState([]);
    const [variantsByItem, setVariantsByItem] = useState({});

    const [selectedSupplierId, setSelectedSupplierId] = useState('');
    const [selectedItemId, setSelectedItemId] = useState('');
    const [selectedVariantId, setSelectedVariantId] = useState('');

    const [rows, setRows] = useState([]);
    const [loadingRows, setLoadingRows] = useState(false);
    const [error, setError] = useState(null);

    const [search, setSearch] = useState('');
    const [editing, setEditing] = useState(null); // { id, code, notes } or null
    const [rowError, setRowError] = useState({}); // { [rowId]: message }
    const [adding, setAdding] = useState(null); // see schema below
    const [pasteOpen, setPasteOpen] = useState(false);
    const [toast, setToast] = useState('');

    useEffect(() => {
        Promise.all([
            storeManagerApi.getSuppliers().catch(() => ({ data: [] })),
            trimsApi.getItems().catch(() => ({ data: [] })),
        ]).then(([sup, it]) => {
            setSuppliers(sup.data || []);
            setItems(it.data || []);
        });
    }, []);

    const loadVariantsForItem = useCallback(async (itemId) => {
        if (!itemId) return [];
        if (variantsByItem[itemId]) return variantsByItem[itemId];
        try {
            const res = await trimsApi.getVariants(itemId);
            const list = res.data || [];
            setVariantsByItem(prev => ({ ...prev, [itemId]: list }));
            return list;
        } catch {
            return [];
        }
    }, [variantsByItem]);

    const fetchRows = useCallback(async () => {
        setError(null);
        if (mode === 'supplier') {
            if (!selectedSupplierId) { setRows([]); return; }
            setLoadingRows(true);
            try {
                const res = await trimsApi.getSupplierVariantCodes(selectedSupplierId);
                setRows(res.data || []);
            } catch (e) {
                setError(e?.response?.data?.error || 'Failed to load supplier codes.');
                setRows([]);
            } finally {
                setLoadingRows(false);
            }
        } else {
            if (!selectedVariantId) { setRows([]); return; }
            setLoadingRows(true);
            try {
                const res = await trimsApi.getVariantSupplierCodes(selectedVariantId);
                setRows(res.data || []);
            } catch (e) {
                setError(e?.response?.data?.error || 'Failed to load supplier codes.');
                setRows([]);
            } finally {
                setLoadingRows(false);
            }
        }
    }, [mode, selectedSupplierId, selectedVariantId]);

    useEffect(() => { fetchRows(); }, [fetchRows]);

    useEffect(() => {
        if (selectedItemId) loadVariantsForItem(selectedItemId);
        setSelectedVariantId('');
    }, [selectedItemId, loadVariantsForItem]);

    const filteredRows = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return rows;
        return rows.filter(r => {
            const haystack = [
                r.trim_item_name, r.trim_item_code,
                r.variant_color_name, r.color_name,
                r.variant_color_number, r.color_number,
                r.variant_size,
                r.supplier_name, r.supplier_color_code, r.code, r.supplier_color_notes, r.notes,
            ].filter(Boolean).map(String).join(' ').toLowerCase();
            return haystack.includes(q);
        });
    }, [rows, search]);

    const selectedSupplier = useMemo(
        () => suppliers.find(s => String(s.id) === String(selectedSupplierId)) || null,
        [suppliers, selectedSupplierId]
    );

    const startEdit = (r) => {
        setEditing({
            id: r.id,
            code: r.supplier_color_code ?? r.code ?? '',
            notes: r.supplier_color_notes ?? r.notes ?? '',
        });
        setRowError(prev => ({ ...prev, [r.id]: undefined }));
    };
    const cancelEdit = () => setEditing(null);
    const commitEdit = async (r) => {
        const variantId = mode === 'supplier' ? r.trim_item_variant_id : selectedVariantId;
        const supplierId = mode === 'supplier' ? selectedSupplierId : r.supplier_id;
        if (!editing.code.trim()) {
            setRowError(prev => ({ ...prev, [r.id]: 'Code is required.' }));
            return;
        }
        try {
            await trimsApi.upsertVariantSupplierCode(variantId, {
                supplier_id: Number(supplierId),
                supplier_color_code: editing.code.trim(),
                supplier_color_notes: editing.notes.trim() || null,
            });
            const newCode = editing.code.trim();
            const newNotes = editing.notes.trim() || null;
            setRows(prev => prev.map(x => x.id === r.id
                ? { ...x, code: newCode, supplier_color_code: newCode, notes: newNotes, supplier_color_notes: newNotes }
                : x));
            setEditing(null);
        } catch (e) {
            setRowError(prev => ({ ...prev, [r.id]: e?.response?.data?.error || 'Save failed.' }));
        }
    };

    const handleDelete = async (r) => {
        const codeLabel = r.supplier_color_code ?? r.code ?? '';
        const label = mode === 'supplier'
            ? `${r.trim_item_name || ''} ${variantLabel(r)}`.trim()
            : `${r.supplier_name || ''} → ${codeLabel}`;
        if (!window.confirm(`Remove this code mapping (${label})?`)) return;
        const variantId = mode === 'supplier' ? r.trim_item_variant_id : selectedVariantId;
        try {
            await trimsApi.deleteVariantSupplierCode(variantId, r.id);
            setRows(prev => prev.filter(x => x.id !== r.id));
            setToast('Mapping removed.');
        } catch (e) {
            setRowError(prev => ({ ...prev, [r.id]: e?.response?.data?.error || 'Delete failed.' }));
        }
    };

    const startAdd = () => {
        if (mode === 'supplier') {
            setAdding({ itemId: '', variantId: '', code: '', notes: '', error: null });
        } else {
            setAdding({ supplierId: '', code: '', notes: '', error: null });
        }
    };
    const cancelAdd = () => setAdding(null);

    const commitAdd = async () => {
        if (mode === 'supplier') {
            if (!adding.variantId || !adding.code.trim()) {
                setAdding(prev => ({ ...prev, error: 'Pick an item, variant, and enter a code.' }));
                return;
            }
            try {
                await trimsApi.upsertVariantSupplierCode(adding.variantId, {
                    supplier_id: Number(selectedSupplierId),
                    supplier_color_code: adding.code.trim(),
                    supplier_color_notes: adding.notes.trim() || null,
                });
                setAdding(null);
                setToast('Mapping added.');
                fetchRows();
            } catch (e) {
                setAdding(prev => ({ ...prev, error: e?.response?.data?.error || 'Save failed.' }));
            }
        } else {
            if (!adding.supplierId || !adding.code.trim()) {
                setAdding(prev => ({ ...prev, error: 'Pick a supplier and enter a code.' }));
                return;
            }
            try {
                await trimsApi.upsertVariantSupplierCode(selectedVariantId, {
                    supplier_id: Number(adding.supplierId),
                    supplier_color_code: adding.code.trim(),
                    supplier_color_notes: adding.notes.trim() || null,
                });
                setAdding(null);
                setToast('Mapping added.');
                fetchRows();
            } catch (e) {
                setAdding(prev => ({ ...prev, error: e?.response?.data?.error || 'Save failed.' }));
            }
        }
    };

    const addRowVariants = useMemo(() => {
        if (mode !== 'supplier' || !adding?.itemId) return [];
        return variantsByItem[adding.itemId] || [];
    }, [mode, adding, variantsByItem]);

    useEffect(() => {
        if (mode === 'supplier' && adding?.itemId) loadVariantsForItem(adding.itemId);
    }, [mode, adding?.itemId, loadVariantsForItem]);

    const variantOptions = useMemo(
        () => variantsByItem[selectedItemId] || [],
        [variantsByItem, selectedItemId]
    );

    return (
        <div className="max-w-7xl mx-auto p-6">
            <div className="flex items-center gap-3 mb-1">
                <LuTag className="text-indigo-600" size={22} />
                <h1 className="text-2xl font-bold text-slate-900">Supplier Color Code Catalog</h1>
            </div>
            <p className="text-sm text-slate-500 mb-5">Map each supplier's SKU codes to our internal trim variants.</p>

            <div className="mb-4">
                <SegmentedToggle value={mode} onChange={setModePersist} />
            </div>

            <div className="bg-white border border-slate-200 rounded-xl shadow-sm">
                <div className="p-4 border-b border-slate-100 flex flex-wrap gap-3 items-end">
                    {mode === 'supplier' ? (
                        <div className="flex-1 min-w-[220px]">
                            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">Supplier</label>
                            <select
                                value={selectedSupplierId}
                                onChange={e => setSelectedSupplierId(e.target.value)}
                                className="w-full p-2 border border-slate-200 rounded text-sm focus:ring-2 focus:ring-indigo-400 outline-none"
                            >
                                <option value="">Select supplier…</option>
                                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                        </div>
                    ) : (
                        <>
                            <div className="flex-1 min-w-[200px]">
                                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">Trim Item</label>
                                <select
                                    value={selectedItemId}
                                    onChange={e => setSelectedItemId(e.target.value)}
                                    className="w-full p-2 border border-slate-200 rounded text-sm focus:ring-2 focus:ring-indigo-400 outline-none"
                                >
                                    <option value="">Select item…</option>
                                    {items.map(it => <option key={it.id} value={it.id}>{itemLabel(it)}</option>)}
                                </select>
                            </div>
                            <div className="flex-1 min-w-[200px]">
                                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">Variant</label>
                                <select
                                    value={selectedVariantId}
                                    onChange={e => setSelectedVariantId(e.target.value)}
                                    disabled={!selectedItemId}
                                    className="w-full p-2 border border-slate-200 rounded text-sm focus:ring-2 focus:ring-indigo-400 outline-none disabled:bg-slate-50"
                                >
                                    <option value="">Select variant…</option>
                                    {variantOptions.map(v => <option key={v.id} value={v.id}>{variantLabel(v)}</option>)}
                                </select>
                            </div>
                        </>
                    )}

                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={startAdd}
                            disabled={mode === 'supplier' ? !selectedSupplierId : !selectedVariantId}
                            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white rounded disabled:opacity-50"
                        >
                            <LuPlus size={15} /> Add row
                        </button>
                        {mode === 'supplier' && (
                            <button
                                type="button"
                                onClick={() => setPasteOpen(true)}
                                disabled={!selectedSupplierId}
                                className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium border border-slate-200 hover:bg-slate-50 text-slate-700 rounded disabled:opacity-50"
                            >
                                <LuClipboardPaste size={15} /> Paste catalog
                            </button>
                        )}
                    </div>
                </div>

                <div className="p-4 border-b border-slate-100 flex items-center gap-3">
                    <div className="relative flex-1 max-w-md">
                        <LuSearch className="absolute left-2.5 top-2.5 text-slate-400" size={14} />
                        <input
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Filter by item, color, code…"
                            className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 rounded focus:ring-2 focus:ring-indigo-400 outline-none"
                        />
                    </div>
                    <div className="text-xs text-slate-500">
                        {filteredRows.length} {filteredRows.length === 1 ? 'mapping' : 'mappings'}
                        {search && rows.length !== filteredRows.length && ` · ${rows.length} total`}
                    </div>
                </div>

                {error && (
                    <div className="px-4 py-3 bg-rose-50 text-rose-700 text-sm border-b border-rose-100">{error}</div>
                )}

                {loadingRows ? (
                    <div className="p-10 flex justify-center"><Spinner /></div>
                ) : (mode === 'supplier' && !selectedSupplierId) ? (
                    <EmptyState
                        title="Pick a supplier to view their code catalog."
                        hint="Each supplier has its own SKU naming for the same colors."
                    />
                ) : (mode === 'variant' && !selectedVariantId) ? (
                    <EmptyState
                        title="Pick a trim item and variant to view per-supplier codes."
                        hint="See every supplier's SKU code for that single color."
                    />
                ) : (filteredRows.length === 0 && !adding) ? (
                    <EmptyState
                        title={
                            mode === 'supplier'
                                ? `No supplier codes yet for ${selectedSupplier?.name || 'this supplier'}.`
                                : `No supplier codes yet for this variant.`
                        }
                        hint="Click '+ Add row' to enter one, or 'Paste catalog' to bulk-import from Excel."
                    />
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-50 text-slate-600 uppercase text-xs">
                                <tr className="text-left">
                                    {mode === 'supplier' ? (
                                        <>
                                            <th className="px-4 py-3 font-semibold">Trim Item</th>
                                            <th className="px-4 py-3 font-semibold">Variant</th>
                                        </>
                                    ) : (
                                        <th className="px-4 py-3 font-semibold">Supplier</th>
                                    )}
                                    <th className="px-4 py-3 font-semibold">Supplier Code</th>
                                    <th className="px-4 py-3 font-semibold">Notes</th>
                                    <th className="px-4 py-3 font-semibold w-32 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {adding && (
                                    <AddRow
                                        mode={mode}
                                        adding={adding}
                                        setAdding={setAdding}
                                        items={items}
                                        suppliers={suppliers}
                                        addRowVariants={addRowVariants}
                                        onCancel={cancelAdd}
                                        onSave={commitAdd}
                                    />
                                )}
                                {filteredRows.map(r => {
                                    const isEditing = editing?.id === r.id;
                                    return (
                                        <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50">
                                            {mode === 'supplier' ? (
                                                <>
                                                    <td className="px-4 py-2.5">
                                                        <div className="text-slate-900">{r.trim_item_name || '—'}</div>
                                                        {r.trim_item_code && (
                                                            <div className="text-xs text-slate-500">{r.trim_item_code}</div>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-2.5">
                                                        <div className="text-slate-900">{(r.variant_color_name ?? r.color_name) || '—'}</div>
                                                        <div className="text-xs text-slate-500">
                                                            {(r.variant_color_number ?? r.color_number) && `#${r.variant_color_number ?? r.color_number}`}
                                                            {r.variant_size && ` · ${r.variant_size}`}
                                                        </div>
                                                    </td>
                                                </>
                                            ) : (
                                                <td className="px-4 py-2.5">
                                                    <div className="text-slate-900">{r.supplier_name || '—'}</div>
                                                </td>
                                            )}
                                            <td className="px-4 py-2.5 font-mono">
                                                {isEditing ? (
                                                    <input
                                                        autoFocus
                                                        value={editing.code}
                                                        onChange={e => setEditing(prev => ({ ...prev, code: e.target.value }))}
                                                        onKeyDown={e => {
                                                            if (e.key === 'Enter') commitEdit(r);
                                                            if (e.key === 'Escape') cancelEdit();
                                                        }}
                                                        className="w-full p-1.5 border border-indigo-300 rounded text-sm font-mono focus:ring-2 focus:ring-indigo-400 outline-none"
                                                    />
                                                ) : (
                                                    <span className="text-slate-900">{(r.supplier_color_code ?? r.code) || '—'}</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-2.5 text-slate-600">
                                                {isEditing ? (
                                                    <input
                                                        value={editing.notes}
                                                        onChange={e => setEditing(prev => ({ ...prev, notes: e.target.value }))}
                                                        onKeyDown={e => {
                                                            if (e.key === 'Enter') commitEdit(r);
                                                            if (e.key === 'Escape') cancelEdit();
                                                        }}
                                                        placeholder="optional"
                                                        className="w-full p-1.5 border border-indigo-300 rounded text-sm focus:ring-2 focus:ring-indigo-400 outline-none"
                                                    />
                                                ) : (
                                                    <span>{(r.supplier_color_notes ?? r.notes) || <span className="text-slate-300">—</span>}</span>
                                                )}
                                                {rowError[r.id] && (
                                                    <div className="text-xs text-rose-600 mt-1">{rowError[r.id]}</div>
                                                )}
                                            </td>
                                            <td className="px-4 py-2.5 text-right">
                                                {isEditing ? (
                                                    <div className="inline-flex gap-1">
                                                        <button
                                                            onClick={() => commitEdit(r)}
                                                            className="p-1.5 rounded text-emerald-700 hover:bg-emerald-50"
                                                            title="Save"
                                                        ><LuCheck size={16} /></button>
                                                        <button
                                                            onClick={cancelEdit}
                                                            className="p-1.5 rounded text-slate-600 hover:bg-slate-100"
                                                            title="Cancel"
                                                        ><LuX size={16} /></button>
                                                    </div>
                                                ) : (
                                                    <div className="inline-flex gap-1">
                                                        <button
                                                            onClick={() => startEdit(r)}
                                                            className="p-1.5 rounded text-slate-600 hover:bg-slate-100"
                                                            title="Edit"
                                                        ><LuPencil size={15} /></button>
                                                        <button
                                                            onClick={() => handleDelete(r)}
                                                            className="p-1.5 rounded text-rose-600 hover:bg-rose-50"
                                                            title="Delete"
                                                        ><LuTrash2 size={15} /></button>
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {pasteOpen && selectedSupplier && (
                <BulkPasteModal
                    supplier={selectedSupplier}
                    items={items}
                    onClose={() => setPasteOpen(false)}
                    onApply={(count) => {
                        setPasteOpen(false);
                        setToast(`Imported ${count} mapping${count === 1 ? '' : 's'} for ${selectedSupplier.name}.`);
                        fetchRows();
                    }}
                />
            )}

            <Toast message={toast} onDone={() => setToast('')} />
        </div>
    );
};

const EmptyState = ({ title, hint }) => (
    <div className="p-12 text-center">
        <div className="inline-flex items-center justify-center h-12 w-12 rounded-full bg-slate-100 text-slate-400 mb-3">
            <LuTag size={20} />
        </div>
        <div className="text-slate-700 font-medium">{title}</div>
        {hint && <div className="text-sm text-slate-500 mt-1">{hint}</div>}
    </div>
);

const AddRow = ({ mode, adding, setAdding, items, suppliers, addRowVariants, onCancel, onSave }) => {
    if (mode === 'supplier') {
        return (
            <tr className="bg-indigo-50/40 border-t border-indigo-100">
                <td className="px-4 py-2">
                    <select
                        value={adding.itemId}
                        onChange={e => setAdding(prev => ({ ...prev, itemId: e.target.value, variantId: '' }))}
                        className="w-full p-1.5 border border-indigo-300 rounded text-sm focus:ring-2 focus:ring-indigo-400 outline-none"
                    >
                        <option value="">Trim item…</option>
                        {items.map(it => <option key={it.id} value={it.id}>{itemLabel(it)}</option>)}
                    </select>
                </td>
                <td className="px-4 py-2">
                    <select
                        value={adding.variantId}
                        onChange={e => setAdding(prev => ({ ...prev, variantId: e.target.value }))}
                        disabled={!adding.itemId}
                        className="w-full p-1.5 border border-indigo-300 rounded text-sm focus:ring-2 focus:ring-indigo-400 outline-none disabled:bg-slate-50"
                    >
                        <option value="">Variant…</option>
                        {addRowVariants.map(v => <option key={v.id} value={v.id}>{variantLabel(v)}</option>)}
                    </select>
                </td>
                <td className="px-4 py-2">
                    <input
                        autoFocus
                        value={adding.code}
                        onChange={e => setAdding(prev => ({ ...prev, code: e.target.value }))}
                        placeholder="Supplier code"
                        className="w-full p-1.5 border border-indigo-300 rounded text-sm font-mono focus:ring-2 focus:ring-indigo-400 outline-none"
                    />
                </td>
                <td className="px-4 py-2">
                    <input
                        value={adding.notes}
                        onChange={e => setAdding(prev => ({ ...prev, notes: e.target.value }))}
                        placeholder="optional"
                        className="w-full p-1.5 border border-indigo-300 rounded text-sm focus:ring-2 focus:ring-indigo-400 outline-none"
                    />
                    {adding.error && <div className="text-xs text-rose-600 mt-1">{adding.error}</div>}
                </td>
                <td className="px-4 py-2 text-right">
                    <div className="inline-flex gap-1">
                        <button onClick={onSave} className="p-1.5 rounded text-emerald-700 hover:bg-emerald-50" title="Save"><LuCheck size={16} /></button>
                        <button onClick={onCancel} className="p-1.5 rounded text-slate-600 hover:bg-slate-100" title="Cancel"><LuX size={16} /></button>
                    </div>
                </td>
            </tr>
        );
    }
    return (
        <tr className="bg-indigo-50/40 border-t border-indigo-100">
            <td className="px-4 py-2">
                <select
                    value={adding.supplierId}
                    onChange={e => setAdding(prev => ({ ...prev, supplierId: e.target.value }))}
                    className="w-full p-1.5 border border-indigo-300 rounded text-sm focus:ring-2 focus:ring-indigo-400 outline-none"
                >
                    <option value="">Supplier…</option>
                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
            </td>
            <td className="px-4 py-2">
                <input
                    autoFocus
                    value={adding.code}
                    onChange={e => setAdding(prev => ({ ...prev, code: e.target.value }))}
                    placeholder="Supplier code"
                    className="w-full p-1.5 border border-indigo-300 rounded text-sm font-mono focus:ring-2 focus:ring-indigo-400 outline-none"
                />
            </td>
            <td className="px-4 py-2">
                <input
                    value={adding.notes}
                    onChange={e => setAdding(prev => ({ ...prev, notes: e.target.value }))}
                    placeholder="optional"
                    className="w-full p-1.5 border border-indigo-300 rounded text-sm focus:ring-2 focus:ring-indigo-400 outline-none"
                />
                {adding.error && <div className="text-xs text-rose-600 mt-1">{adding.error}</div>}
            </td>
            <td className="px-4 py-2 text-right">
                <div className="inline-flex gap-1">
                    <button onClick={onSave} className="p-1.5 rounded text-emerald-700 hover:bg-emerald-50" title="Save"><LuCheck size={16} /></button>
                    <button onClick={onCancel} className="p-1.5 rounded text-slate-600 hover:bg-slate-100" title="Cancel"><LuX size={16} /></button>
                </div>
            </td>
        </tr>
    );
};

export default SupplierColorCodesPage;

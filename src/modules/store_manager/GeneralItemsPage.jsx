import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
    Package, Search, Plus, AlertTriangle, X, Loader2,
    CheckCircle2, BookOpen, ClipboardList, ChevronDown, Download, IndianRupee,
    Settings2, ArrowUpRight,
} from 'lucide-react';
import { generalItemsApi } from '../../api/generalItemsApi';
import { storeManagerApi } from '../../api/storeManagerApi';
import { hrApi } from '../../api/hrApi';
import SearchableSelect from '../../shared/SearchableSelect';
import { useAuth } from '../../context/AuthContext';

// ─── shared ────────────────────────────────────────────────────────────────
const LabeledField = ({ label, required, children }) => (
    <div>
        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
            {label}{required && ' *'}
        </label>
        {children}
    </div>
);

const inputCls = 'w-full text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:border-orange-400';

// Postgres numerics arrive as strings ("1825.00") — always parse before math/formatting.
// Null unit_cost means "never priced": render — rather than ₹0 to flag it.
const money = (v) => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : '—';
};
const qtyNum = (v) => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n.toLocaleString('en-IN', { maximumFractionDigits: 3 }) : '—';
};

function Toast({ toast }) {
    if (!toast) return null;
    return (
        <div className={`fixed bottom-4 right-4 z-[60] flex items-center gap-2 px-4 py-3 rounded-xl shadow-xl text-sm font-bold transition-all
            ${toast.kind === 'error' ? 'bg-red-600 text-white' : 'bg-emerald-600 text-white'}`}>
            {toast.kind === 'error' ? <AlertTriangle size={14} /> : <CheckCircle2 size={14} />}
            {toast.message}
        </div>
    );
}

// ─── CreateEditModal ────────────────────────────────────────────────────────
// Exported: also used by the admin master-list page (admin/GeneralItemsMasterPage).
export function CreateEditModal({ item, categories, onSaved, onClose }) {
    const isEdit = !!item;
    const [form, setForm] = useState({
        name:                item?.name ?? '',
        item_code:           item?.item_code ?? '',
        category_id:         item?.category_id ? String(item.category_id) : '',
        uom:                 item?.uom ?? '',
        unit_cost:           item?.unit_cost != null ? String(item.unit_cost) : '',
        low_stock_threshold: item?.low_stock_threshold != null ? String(item.low_stock_threshold) : '',
        opening_stock:       '',
    });
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState(null);

    // inline "new category" state
    const [newCatName, setNewCatName] = useState('');
    const [showNewCat, setShowNewCat] = useState(false);
    const [newCatBusy, setNewCatBusy] = useState(false);
    const [localCats, setLocalCats] = useState(categories);

    const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

    const handleAddCategory = async () => {
        if (!newCatName.trim()) return;
        setNewCatBusy(true);
        try {
            const r = await generalItemsApi.createCategory({ name: newCatName.trim() });
            const cat = r.data?.data ?? r.data;
            setLocalCats(prev => [...prev, cat]);
            set('category_id', String(cat.id));
            setNewCatName('');
            setShowNewCat(false);
        } catch {
            // silently ignore — user can try again
        } finally {
            setNewCatBusy(false);
        }
    };

    const handleSubmit = async () => {
        if (!form.name.trim()) { setErr('Name is required.'); return; }
        setBusy(true); setErr(null);
        const payload = {
            name: form.name.trim(),
            ...(form.item_code.trim()            ? { item_code:           form.item_code.trim() }            : {}),
            ...(form.category_id                 ? { category_id:         parseInt(form.category_id) }        : {}),
            ...(form.uom.trim()                  ? { uom:                 form.uom.trim() }                   : {}),
            ...(form.unit_cost !== ''            ? { unit_cost:           parseFloat(form.unit_cost) || 0 }   : {}),
            ...(form.low_stock_threshold !== ''  ? { low_stock_threshold: parseFloat(form.low_stock_threshold) || 0 } : {}),
            ...(!isEdit && form.opening_stock !== '' ? { opening_stock: parseFloat(form.opening_stock) || 0 } : {}),
        };
        try {
            if (isEdit) {
                await generalItemsApi.updateItem(item.id, payload);
            } else {
                await generalItemsApi.createItem(payload);
            }
            onSaved();
        } catch (e) {
            setErr(e?.response?.data?.error || 'Save failed.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                    <h2 className="text-sm font-bold text-slate-800">{isEdit ? 'Edit Item' : 'New General Item'}</h2>
                    <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-full transition"><X size={14} className="text-slate-400" /></button>
                </div>
                <div className="overflow-auto flex-1 px-5 py-4 space-y-4">
                    <LabeledField label="Name" required>
                        <input autoFocus type="text" value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Sewing Needle #14" className={inputCls} />
                    </LabeledField>
                    <div className="grid grid-cols-2 gap-3">
                        <LabeledField label="Item Code">
                            <input type="text" value={form.item_code} onChange={e => set('item_code', e.target.value)} placeholder="GI-001" className={inputCls} />
                        </LabeledField>
                        <LabeledField label="UOM">
                            <input type="text" value={form.uom} onChange={e => set('uom', e.target.value)} placeholder="pcs / kg / m" className={inputCls} />
                        </LabeledField>
                    </div>
                    <LabeledField label="Category">
                        <div className="space-y-1.5">
                            <select value={form.category_id} onChange={e => set('category_id', e.target.value)} className={inputCls + ' bg-white'}>
                                <option value="">— No category —</option>
                                {localCats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                            {!showNewCat ? (
                                <button type="button" onClick={() => setShowNewCat(true)} className="text-[11px] font-semibold text-orange-500 hover:text-orange-600 flex items-center gap-1">
                                    <Plus size={11} /> New category
                                </button>
                            ) : (
                                <div className="flex gap-1.5">
                                    <input autoFocus type="text" value={newCatName} onChange={e => setNewCatName(e.target.value)} placeholder="Category name" className={inputCls + ' flex-1 !py-1.5 text-xs'} onKeyDown={e => e.key === 'Enter' && handleAddCategory()} />
                                    <button onClick={handleAddCategory} disabled={newCatBusy} className="text-xs font-bold text-white bg-orange-500 px-2.5 py-1.5 rounded-xl disabled:opacity-40">
                                        {newCatBusy ? <Loader2 size={11} className="animate-spin" /> : 'Add'}
                                    </button>
                                    <button onClick={() => setShowNewCat(false)} className="text-xs text-slate-400 hover:text-slate-600 px-2"><X size={11} /></button>
                                </div>
                            )}
                        </div>
                    </LabeledField>
                    <div className="grid grid-cols-2 gap-3">
                        <LabeledField label="Unit Cost">
                            <input type="number" min="0" step="any" value={form.unit_cost} onChange={e => set('unit_cost', e.target.value)} placeholder="0.00" className={inputCls} />
                        </LabeledField>
                        <LabeledField label="Low Stock Threshold">
                            <input type="number" min="0" step="any" value={form.low_stock_threshold} onChange={e => set('low_stock_threshold', e.target.value)} placeholder="10" className={inputCls} />
                        </LabeledField>
                    </div>
                    {!isEdit && (
                        <LabeledField label="Opening Stock">
                            <input type="number" min="0" step="any" value={form.opening_stock} onChange={e => set('opening_stock', e.target.value)} placeholder="0" className={inputCls} />
                        </LabeledField>
                    )}
                    {err && <p className="text-xs text-red-600 flex items-center gap-1"><AlertTriangle size={12} />{err}</p>}
                </div>
                <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-100">
                    <button onClick={onClose} className="text-xs font-medium text-slate-500 border border-slate-200 hover:bg-slate-50 px-3 py-1.5 rounded-lg transition">Cancel</button>
                    <button onClick={handleSubmit} disabled={busy} className="text-xs font-bold text-white bg-orange-500 hover:bg-orange-600 disabled:opacity-40 px-4 py-1.5 rounded-lg transition flex items-center gap-1.5">
                        {busy ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
                        {isEdit ? 'Save Changes' : 'Create Item'}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── IssueSlipModal ──────────────────────────────────────────────────────────
// onIssued(result) fires on 201 (refresh lists, toast) WITHOUT closing —
// the success screen stays up until the user dismisses it.
// Lines are mixed-kind: general items or trim variants (whole-number qty only).
const trimVariantId = (v) => v.variant_id ?? v.id;
const trimVariantStock = (v) => {
    const n = parseFloat(v.in_stock ?? v.main_store_stock);
    return Number.isFinite(n) ? n : null;
};
const trimVariantLabel = (v) => {
    const color = `${v.color_number ? `${v.color_number} - ` : ''}${v.color_name || ''}`.trim() || `Variant #${trimVariantId(v)}`;
    const size = v.size ?? v.variant_size;
    const stock = trimVariantStock(v);
    const price = parseFloat(v.last_purchase_price);
    // Server rejects unpriced trims — flag them right in the picker.
    const priceBit = Number.isFinite(price) ? `Last @ ${money(price)}` : '⚠ no purchase price';
    return `${color}${size ? ` / ${size}` : ''} · Stock: ${stock != null ? qtyNum(stock) : '—'} · ${priceBit}`;
};

function IssueSlipModal({ items, onIssued, onClose }) {
    const emptyLine = () => ({ kind: 'general', general_item_id: '', trim_item_id: '', trim_item_variant_id: '', variants: [], variantsLoading: false, qty: '' });

    const [dept, setDept] = useState('');
    const [personId, setPersonId] = useState('');
    const [recoverFromSalary, setRecoverFromSalary] = useState(false);
    const [notes, setNotes] = useState('');
    const [lines, setLines] = useState([emptyLine()]);
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState(null);
    const [lineErrs, setLineErrs] = useState({});   // { lineIdx: verbatim 409 message }
    const [result, setResult] = useState(null);
    const [users, setUsers] = useState([]);
    const [deptSuggestions, setDeptSuggestions] = useState([]);
    const [trimCatalog, setTrimCatalog] = useState([]);
    const variantCache = useRef({});                // trim_item_id → variants[]

    useEffect(() => {
        // Any employee can receive an issue (not just system users) — HR master is the source.
        hrApi.getAllEmployees()
            .then(r => {
                const list = r.data?.data ?? r.data ?? [];
                setUsers((Array.isArray(list) ? list : [])
                    .filter(e => !e.status || e.status === 'Active')
                    .map(e => ({ value: e.emp_id, label: `${e.employee_name} (${e.emp_id})${e.designation ? ` · ${e.designation}` : ''}` })));
            })
            .catch(() => {});
        // Same source as the trim inward form — variants come per item on demand.
        storeManagerApi.getAllTrimItems()
            .then(r => {
                const list = r.data?.data ?? r.data ?? [];
                setTrimCatalog(Array.isArray(list) ? list : []);
            })
            .catch(() => {});
        // Departments are free text (no master) — suggest from recent history.
        generalItemsApi.getIssues({ limit: 200 })
            .then(r => {
                const list = r.data?.data ?? r.data ?? [];
                setDeptSuggestions([...new Set(list.map(i => i.issued_to_department).filter(Boolean))]);
            })
            .catch(() => {});
    }, []);

    const itemInfo = useMemo(() => {
        const m = {};
        items.forEach(i => {
            m[i.id] = {
                name:  i.name,
                uom:   i.uom || '',
                stock: parseFloat(i.current_stock ?? 0),
                cost:  i.unit_cost != null ? parseFloat(i.unit_cost) : null,
            };
        });
        return m;
    }, [items]);

    const pickerOptions = useMemo(() =>
        items.filter(i => i.is_active !== false).map(i => {
            const info = itemInfo[i.id];
            return {
                value: i.id,
                label: `${i.name}${i.item_code ? ` (${i.item_code})` : ''} · ${qtyNum(info.stock)} ${info.uom || 'in stock'} @ ${money(i.unit_cost)}`,
            };
        }),
    [items, itemInfo]);

    const trimItemOptions = useMemo(() =>
        trimCatalog.map(t => ({ value: t.id, label: `${t.name}${t.brand ? ` - ${t.brand}` : ''}` })),
    [trimCatalog]);

    const setLine = (idx, k, v) => {
        setLines(prev => prev.map((l, i) => i === idx ? { ...l, [k]: v } : l));
        setLineErrs(prev => { if (!(idx in prev)) return prev; const n = { ...prev }; delete n[idx]; return n; });
    };
    const setLineKind = (idx, kind) => {
        setLines(prev => prev.map((l, i) => i === idx ? { ...emptyLine(), kind } : l));
        setLineErrs(prev => { if (!(idx in prev)) return prev; const n = { ...prev }; delete n[idx]; return n; });
    };
    const setLineTrimItem = async (idx, itemId) => {
        const cached = itemId ? variantCache.current[itemId] : null;
        setLines(prev => prev.map((l, i) => i === idx
            ? { ...l, trim_item_id: itemId, trim_item_variant_id: '', variants: cached || [], variantsLoading: !!itemId && !cached }
            : l));
        setLineErrs(prev => { if (!(idx in prev)) return prev; const n = { ...prev }; delete n[idx]; return n; });
        if (!itemId || cached) return;
        try {
            const r = await storeManagerApi.getVariantsByItem(itemId);
            const list = r.data?.data ?? r.data ?? [];
            variantCache.current[itemId] = Array.isArray(list) ? list : [];
            setLines(prev => prev.map((l, i) => i === idx && String(l.trim_item_id) === String(itemId)
                ? { ...l, variants: variantCache.current[itemId], variantsLoading: false }
                : l));
        } catch {
            setLines(prev => prev.map((l, i) => i === idx ? { ...l, variantsLoading: false } : l));
        }
    };
    const addLine = () => setLines(prev => [...prev, emptyLine()]);
    const removeLine = (idx) => {
        setLines(prev => prev.filter((_, i) => i !== idx));
        setLineErrs({});
    };

    const lineVariant = (l) => l.kind === 'trim'
        ? l.variants.find(v => String(trimVariantId(v)) === String(l.trim_item_variant_id))
        : null;
    const lineCost = (l) => {
        if (l.kind === 'trim') {
            const v = lineVariant(l);
            const n = v ? parseFloat(v.last_purchase_price) : NaN;
            return Number.isFinite(n) ? n : null;
        }
        return itemInfo[l.general_item_id]?.cost ?? null;
    };
    const linePicked = (l) => l.kind === 'trim' ? !!l.trim_item_variant_id : !!l.general_item_id;
    const lineValue = (l) => {
        const cost = linePicked(l) ? lineCost(l) : null;
        if (cost == null) return null;
        const q = parseFloat(l.qty);
        return Number.isFinite(q) ? q * cost : null;
    };
    const isFractionalTrim = (l) => l.kind === 'trim' && l.qty !== '' && !Number.isInteger(parseFloat(l.qty));
    const slipTotal = lines.reduce((s, l) => s + (lineValue(l) ?? 0), 0);
    const hasUnpriced = lines.some(l => linePicked(l) && lineCost(l) == null);

    const lineName = (l) => {
        if (l.kind === 'trim') {
            const v = lineVariant(l);
            const trimName = trimCatalog.find(t => String(t.id) === String(l.trim_item_id))?.name;
            return [trimName, v?.color_name].filter(Boolean).join(' ') || 'A trim line';
        }
        return itemInfo[l.general_item_id]?.name || 'A line';
    };

    const handleSubmit = async () => {
        if (!personId) { setErr('Employee is required.'); return; }
        const validLines = lines.filter(l => linePicked(l) && parseFloat(l.qty) > 0);
        if (!validLines.length) { setErr('Add at least one item with quantity.'); return; }
        if (validLines.some(isFractionalTrim)) { setErr('Trim quantities must be whole numbers.'); return; }
        const unpricedLine = validLines.find(l => lineCost(l) == null);
        if (unpricedLine) { setErr(`"${lineName(unpricedLine)}" has no cost on record — cost is mandatory for issue slips.`); return; }
        // Over-stock is only warned inline — the server enforces atomically and may
        // know better than our possibly-stale snapshot.
        setBusy(true); setErr(null); setLineErrs({});
        // emp_id is usually numeric but may be a code — only coerce when it is a number.
        const empId = Number(personId);
        try {
            const r = await generalItemsApi.createIssue({
                issued_to_employee_id: Number.isFinite(empId) ? empId : personId,
                ...(dept.trim() ? { issued_to_department: dept.trim() } : {}),
                ...(recoverFromSalary ? { recover_from_salary: true } : {}),
                ...(notes.trim() ? { notes: notes.trim() } : {}),
                lines: validLines.map(l => l.kind === 'trim'
                    ? { trim_item_variant_id: parseInt(l.trim_item_variant_id), qty: parseFloat(l.qty) }
                    : { general_item_id: parseInt(l.general_item_id), qty: parseFloat(l.qty) }),
            });
            const data = r.data?.data ?? r.data;
            setResult(data);
            onIssued?.(data);
        } catch (e) {
            const msg = e?.response?.data?.error || 'Failed to create issue.';
            // 409: `Insufficient stock for "X": have N, need M.` — pin it verbatim
            // on the offending line so the user can fix that qty. For trim lines the
            // server names the trim, so match against item/color names too.
            if (e?.response?.status === 409) {
                const quoted = msg.match(/"(.+)"/)?.[1];
                const idx = quoted != null
                    ? lines.findIndex(l => {
                        if (l.kind === 'general') return itemInfo[l.general_item_id]?.name === quoted;
                        const v = lineVariant(l);
                        if (!v) return false;
                        const trimName = trimCatalog.find(t => String(t.id) === String(l.trim_item_id))?.name;
                        return (trimName && quoted.includes(trimName)) || (v.color_name && quoted.includes(v.color_name));
                    })
                    : -1;
                if (idx !== -1) { setLineErrs({ [idx]: msg }); setErr(null); }
                else setErr(msg);
            } else {
                setErr(msg);
            }
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl h-[90vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                    <h2 className="text-sm font-bold text-slate-800">Issue Slip</h2>
                    <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-full transition"><X size={14} className="text-slate-400" /></button>
                </div>

                {result ? (
                    <div className="flex-1 flex flex-col items-center justify-center px-5 py-8 text-center gap-3">
                        <CheckCircle2 size={40} className="text-emerald-500" />
                        <h3 className="text-base font-bold text-slate-800">Issue Created</h3>
                        <p className="text-sm text-slate-500">
                            Issue <span className="font-bold text-slate-700">{result.issue_number || `#${result.id}`}</span>
                            {result.issued_to_name && <> · to <span className="font-bold text-slate-700">{result.issued_to_name}</span></>}
                            {result.total_value != null && (
                                <> · Total value: <span className="font-bold text-slate-700">₹{parseFloat(result.total_value).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span></>
                            )}
                        </p>
                        {recoverFromSalary && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md">
                                <IndianRupee size={9} /> Recover from salary
                            </span>
                        )}
                        <button onClick={onClose} className="mt-2 text-sm font-bold text-white bg-orange-500 hover:bg-orange-600 px-5 py-2 rounded-xl transition">Close</button>
                    </div>
                ) : (
                    <>
                        <div className="overflow-auto flex-1 px-5 py-4 space-y-4">
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <LabeledField label="Issued To (Employee)" required>
                                    <SearchableSelect
                                        value={personId}
                                        onChange={setPersonId}
                                        options={users}
                                        placeholder="— Select employee —"
                                        size="sm"
                                    />
                                </LabeledField>
                                <LabeledField label="Department">
                                    <input type="text" list="gis-dept-suggestions" value={dept} onChange={e => setDept(e.target.value)} placeholder="Optional, e.g. Sampling" className={inputCls} />
                                    <datalist id="gis-dept-suggestions">
                                        {deptSuggestions.map(d => <option key={d} value={d} />)}
                                    </datalist>
                                </LabeledField>
                                <LabeledField label="Notes">
                                    <input type="text" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional notes" className={inputCls} />
                                </LabeledField>
                            </div>
                            <label className="flex items-center gap-2 cursor-pointer select-none">
                                <input
                                    type="checkbox"
                                    checked={recoverFromSalary}
                                    onChange={e => setRecoverFromSalary(e.target.checked)}
                                    className="accent-amber-500"
                                />
                                <span className="text-xs font-semibold text-slate-600 flex items-center gap-1">
                                    <IndianRupee size={11} className="text-amber-600" /> Recover from salary
                                </span>
                            </label>

                            <div>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Items</p>
                                <div className="space-y-2">
                                    {lines.map((line, idx) => {
                                        const isTrim = line.kind === 'trim';
                                        const variant = lineVariant(line);
                                        const info = !isTrim && line.general_item_id ? itemInfo[line.general_item_id] : null;
                                        const stock = isTrim ? (variant ? trimVariantStock(variant) : null) : info?.stock ?? null;
                                        const cost = linePicked(line) ? lineCost(line) : null;
                                        const overStock = stock != null && parseFloat(line.qty) > stock;
                                        const fractional = isFractionalTrim(line);
                                        const unpriced = linePicked(line) && cost == null;
                                        const val = lineValue(line);
                                        const serverErr = lineErrs[idx];
                                        return (
                                            <div key={idx} className={`bg-slate-50 border rounded-xl px-3 py-2 ${serverErr ? 'border-red-300 bg-red-50/60' : 'border-slate-200'}`}>
                                                <div className="flex gap-2 items-start">
                                                    <div className="flex rounded-lg border border-slate-200 overflow-hidden shrink-0 mt-0.5">
                                                        {['general', 'trim'].map(k => (
                                                            <button
                                                                key={k} type="button"
                                                                onClick={() => line.kind !== k && setLineKind(idx, k)}
                                                                className={`text-[10px] font-bold px-2 py-1.5 transition ${line.kind === k ? 'bg-orange-500 text-white' : 'bg-white text-slate-400 hover:text-slate-600'}`}
                                                            >
                                                                {k === 'general' ? 'General' : 'Trim'}
                                                            </button>
                                                        ))}
                                                    </div>
                                                    <div className="flex-1 min-w-0 space-y-1.5">
                                                        {isTrim ? (
                                                            <div className="grid grid-cols-2 gap-1.5">
                                                                <SearchableSelect
                                                                    value={line.trim_item_id}
                                                                    onChange={v => setLineTrimItem(idx, v)}
                                                                    options={trimItemOptions}
                                                                    placeholder="— Select trim item —"
                                                                    size="sm"
                                                                />
                                                                <SearchableSelect
                                                                    value={line.trim_item_variant_id}
                                                                    onChange={v => setLine(idx, 'trim_item_variant_id', v)}
                                                                    options={line.variants.map(v => ({ value: trimVariantId(v), label: trimVariantLabel(v) }))}
                                                                    placeholder={line.variantsLoading ? 'Loading variants…' : line.trim_item_id ? '— Select variant —' : 'Select item first'}
                                                                    disabled={!line.trim_item_id || line.variantsLoading}
                                                                    size="sm"
                                                                />
                                                            </div>
                                                        ) : (
                                                            <SearchableSelect
                                                                value={line.general_item_id}
                                                                onChange={v => setLine(idx, 'general_item_id', v)}
                                                                options={pickerOptions}
                                                                placeholder="— Select item —"
                                                                size="sm"
                                                            />
                                                        )}
                                                        {linePicked(line) && (
                                                            <p className={`text-[10px] ${(overStock || fractional || unpriced) ? 'text-red-500 font-bold' : 'text-slate-400'}`}>
                                                                {(overStock || fractional || unpriced) && <AlertTriangle size={9} className="inline mr-0.5" />}
                                                                In stock: {stock != null ? qtyNum(stock) : '—'}{!isTrim && info?.uom ? ` ${info.uom}` : ''} · @ {money(cost)}
                                                                {isTrim && cost != null && ' (last purchase)'}
                                                                {overStock && ' — exceeds stock, will be rejected'}
                                                                {fractional && ' — whole numbers only for trims'}
                                                                {unpriced && ' — no cost on record, required to issue'}
                                                            </p>
                                                        )}
                                                    </div>
                                                    <input
                                                        type="number" min="0" step={isTrim ? '1' : 'any'}
                                                        value={line.qty} onChange={e => setLine(idx, 'qty', e.target.value)}
                                                        placeholder="Qty"
                                                        className={`w-20 text-sm border rounded-xl px-2 py-2 focus:outline-none focus:border-orange-400 ${(overStock || fractional || serverErr) ? 'border-red-300 bg-red-50' : 'border-slate-200'}`}
                                                    />
                                                    <span className="w-20 text-right text-xs font-bold text-slate-700 tabular-nums mt-2.5 shrink-0">
                                                        {val != null ? money(val) : '—'}
                                                    </span>
                                                    {lines.length > 1 && (
                                                        <button onClick={() => removeLine(idx)} className="p-1.5 hover:bg-red-50 text-slate-400 hover:text-red-500 rounded-lg transition mt-0.5">
                                                            <X size={12} />
                                                        </button>
                                                    )}
                                                </div>
                                                {serverErr && (
                                                    <p className="text-[11px] font-bold text-red-600 mt-1.5 flex items-center gap-1">
                                                        <AlertTriangle size={11} className="shrink-0" /> {serverErr}
                                                    </p>
                                                )}
                                            </div>
                                        );
                                    })}
                                    <div className="flex items-center justify-between mt-1">
                                        <button onClick={addLine} className="text-xs font-semibold text-orange-500 hover:text-orange-600 flex items-center gap-1">
                                            <Plus size={12} /> Add item
                                        </button>
                                        <p className="text-xs text-slate-500">
                                            Slip total: <span className="font-bold text-slate-800 tabular-nums">{money(slipTotal)}</span>
                                            {hasUnpriced && <span className="text-[10px] font-bold text-red-600 ml-1">(unpriced lines — set cost first)</span>}
                                        </p>
                                    </div>
                                    <p className="text-[10px] text-slate-400">Values are a preview at current unit cost — the server computes the authoritative valuation.</p>
                                </div>
                            </div>

                            {err && <p className="text-xs text-red-600 flex items-center gap-1"><AlertTriangle size={12} />{err}</p>}
                        </div>
                        <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-100">
                            <button onClick={onClose} className="text-xs font-medium text-slate-500 border border-slate-200 hover:bg-slate-50 px-3 py-1.5 rounded-lg transition">Cancel</button>
                            <button onClick={handleSubmit} disabled={busy} className="text-xs font-bold text-white bg-orange-500 hover:bg-orange-600 disabled:opacity-40 px-4 py-1.5 rounded-lg transition flex items-center gap-1.5">
                                {busy ? <Loader2 size={11} className="animate-spin" /> : <ClipboardList size={11} />}
                                Create Issue
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

// ─── Tab: Items ─────────────────────────────────────────────────────────────
function ItemsTab({ items, categories, loading, onRefresh, showToast, isAdmin }) {
    const [q, setQ] = useState('');
    const [catFilter, setCat] = useState('');
    const [lowStockOnly, setLowStockOnly] = useState(false);
    const [activeModal, setActiveModal] = useState(null); // 'create' | 'edit' | 'issue'
    const [selected, setSelected] = useState(null);

    const filtered = useMemo(() => {
        return items.filter(it => {
            if (lowStockOnly && !(it.current_stock <= it.low_stock_threshold && it.low_stock_threshold > 0)) return false;
            if (catFilter && String(it.category_id) !== catFilter) return false;
            if (q) {
                const s = q.toLowerCase();
                if (!(it.name?.toLowerCase().includes(s) || it.item_code?.toLowerCase().includes(s))) return false;
            }
            return true;
        });
    }, [items, q, catFilter, lowStockOnly]);

    const handleSaved = () => {
        setActiveModal(null);
        setSelected(null);
        onRefresh();
        showToast({ kind: 'success', message: 'Item saved.' });
    };

    const handleExport = () => {
        const esc = (v) => {
            const s = v == null ? '' : String(v);
            return s.includes(',') || s.includes('"') || s.includes('\n')
                ? `"${s.replace(/"/g, '""')}"`
                : s;
        };
        const headers = ['Item Code', 'Name', 'Category', 'UOM', 'Unit Cost', 'Current Stock', 'Low Stock Threshold', 'Low Stock'];
        const rows = filtered.map(it => [
            esc(it.item_code),
            esc(it.name),
            esc(it.category_name),
            esc(it.uom),
            it.unit_cost != null ? parseFloat(it.unit_cost) : '',
            it.current_stock ?? '',
            it.low_stock_threshold ?? '',
            (it.low_stock_threshold > 0 && it.current_stock <= it.low_stock_threshold) ? 'Yes' : 'No',
        ]);
        const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `general-items-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <>
            <div className="flex flex-wrap items-center gap-2 mb-4">
                <div className="relative flex-1 min-w-[180px]">
                    <Search size={13} className="absolute left-3 top-2.5 text-slate-400" />
                    <input type="text" value={q} onChange={e => setQ(e.target.value)} placeholder="Search name or code…" className="w-full text-sm pl-8 pr-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:border-orange-400" />
                </div>
                <select value={catFilter} onChange={e => setCat(e.target.value)} className="text-sm border border-slate-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:border-orange-400">
                    <option value="">All categories</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <button onClick={() => setLowStockOnly(v => !v)} className={`text-xs font-semibold px-3 py-2 rounded-xl border transition-all ${lowStockOnly ? 'bg-red-50 text-red-600 border-red-200' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'}`}>
                    <AlertTriangle size={11} className="inline mr-1" />Low stock
                </button>
                <div className="flex gap-2 ml-auto">
                    <button onClick={handleExport} disabled={filtered.length === 0} className="text-xs font-bold text-slate-600 border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 px-3 py-2 rounded-xl transition flex items-center gap-1.5">
                        <Download size={12} /> Export
                    </button>
                    <button onClick={() => { setSelected(null); setActiveModal('issue'); }} className="text-xs font-bold text-orange-600 border border-orange-200 bg-orange-50 hover:bg-orange-100 px-3 py-2 rounded-xl transition flex items-center gap-1.5">
                        <ClipboardList size={12} /> Issue Slip
                    </button>
                    {isAdmin && (
                        <button onClick={() => { setSelected(null); setActiveModal('create'); }} className="text-xs font-bold text-white bg-orange-500 hover:bg-orange-600 px-3 py-2 rounded-xl transition flex items-center gap-1.5">
                            <Plus size={12} /> New Item
                        </button>
                    )}
                </div>
            </div>

            {loading ? (
                <div className="flex justify-center py-10"><Loader2 className="animate-spin text-slate-400" size={24} /></div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="min-w-full text-left text-sm">
                        <thead>
                            <tr className="border-b border-slate-100">
                                <th className="pb-2 pr-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Item</th>
                                <th className="pb-2 pr-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider hidden sm:table-cell">Category</th>
                                <th className="pb-2 pr-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-right">Stock</th>
                                <th className="pb-2 pr-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-right hidden md:table-cell">Unit Cost</th>
                                <th className="pb-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-center">Edit</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {filtered.length === 0 && (
                                <tr><td colSpan={5} className="py-8 text-center text-sm text-slate-400 italic">No items found.</td></tr>
                            )}
                            {filtered.map(it => {
                                const isLow = it.low_stock_threshold > 0 && it.current_stock <= it.low_stock_threshold;
                                return (
                                    <tr key={it.id} className={`group transition-colors hover:bg-slate-50 ${isLow ? 'bg-red-50/30' : ''}`}>
                                        <td className="py-2.5 pr-4">
                                            <p className="font-bold text-slate-800 text-xs">{it.name}</p>
                                            <div className="flex items-center gap-1.5 mt-0.5">
                                                {it.item_code && <span className="text-[10px] font-mono text-slate-500 bg-slate-100 px-1 py-0.5 rounded">{it.item_code}</span>}
                                                {it.uom && <span className="text-[10px] text-slate-400">{it.uom}</span>}
                                            </div>
                                        </td>
                                        <td className="py-2.5 pr-4 text-xs text-slate-500 hidden sm:table-cell">{it.category_name || '—'}</td>
                                        <td className="py-2.5 pr-4 text-right">
                                            <p className={`text-sm font-bold tabular-nums ${isLow ? 'text-red-600' : 'text-slate-800'}`}>{it.current_stock ?? 0}</p>
                                            {isLow && (
                                                <span className="text-[9px] font-bold text-red-500 uppercase flex items-center justify-end gap-0.5 mt-0.5">
                                                    <AlertTriangle size={9} />Low Stock
                                                </span>
                                            )}
                                        </td>
                                        <td className="py-2.5 pr-4 text-right hidden md:table-cell">
                                            {it.unit_cost != null ? (
                                                <span className="text-xs text-slate-700">₹{parseFloat(it.unit_cost).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                                            ) : <span className="text-xs text-slate-300">—</span>}
                                        </td>
                                        <td className="py-2.5 text-center">
                                            {isAdmin && (
                                                <button onClick={() => { setSelected(it); setActiveModal('edit'); }} className="text-[10px] font-bold text-slate-500 hover:text-orange-600 border border-slate-200 hover:border-orange-200 px-2 py-1 rounded-lg transition">
                                                    Edit
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {(activeModal === 'create' || activeModal === 'edit') && (
                <CreateEditModal
                    item={activeModal === 'edit' ? selected : null}
                    categories={categories}
                    onSaved={handleSaved}
                    onClose={() => { setActiveModal(null); setSelected(null); }}
                />
            )}
            {activeModal === 'issue' && (
                <IssueSlipModal
                    items={items}
                    onIssued={(res) => {
                        onRefresh(); // stock dropped — keep the modal's success screen up
                        showToast({
                            kind: 'success',
                            message: `${res?.issue_number || 'Issue slip'} issued${res?.total_value != null ? ` — ${money(res.total_value)}` : ''}`,
                        });
                    }}
                    onClose={() => setActiveModal(null)}
                />
            )}
        </>
    );
}

// ─── Tab: Ledger ─────────────────────────────────────────────────────────────
function LedgerTab({ items, onOpenIssue }) {
    const [itemFilter, setItemFilter]   = useState('');
    const [kindFilter, setKindFilter]   = useState('');
    const [dateFrom,   setDateFrom]     = useState('');
    const [dateTo,     setDateTo]       = useState('');
    const [rows,       setRows]         = useState([]);
    const [loading,    setLoading]      = useState(false);
    const [err,        setErr]          = useState(null);

    const load = useCallback(async () => {
        setLoading(true); setErr(null);
        try {
            const params = {};
            if (itemFilter) params.general_item_id = itemFilter;
            if (kindFilter) params.source_kind      = kindFilter;
            if (dateFrom)   params.date_from        = dateFrom;
            if (dateTo)     params.date_to          = dateTo;
            const r = await generalItemsApi.getLedger(params);
            setRows(r.data?.data ?? r.data ?? []);
        } catch {
            setErr('Failed to load ledger.');
        } finally {
            setLoading(false);
        }
    }, [itemFilter, kindFilter, dateFrom, dateTo]);

    useEffect(() => { load(); }, [load]);

    const KIND_LABELS = {
        inward_approve: 'Inward',
        internal_issue: 'Issue',
        opening:        'Opening',
        adjustment:     'Adjustment',
    };

    return (
        <>
            <div className="flex flex-wrap items-center gap-2 mb-4">
                <div className="w-48">
                    <SearchableSelect
                        value={itemFilter}
                        onChange={setItemFilter}
                        options={[{ value: '', label: 'All items' }, ...items.map(i => ({ value: i.id, label: i.name }))]}
                        placeholder="All items"
                        size="sm"
                    />
                </div>
                <select value={kindFilter} onChange={e => setKindFilter(e.target.value)} className="text-sm border border-slate-200 rounded-xl px-3 py-2 bg-white focus:outline-none">
                    <option value="">All types</option>
                    {Object.entries(KIND_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:border-orange-400" />
                <input type="date" value={dateTo}   onChange={e => setDateTo(e.target.value)}   className="text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:border-orange-400" />
            </div>

            {err && <p className="text-xs text-red-600 mb-3">{err}</p>}

            {loading ? (
                <div className="flex justify-center py-10"><Loader2 className="animate-spin text-slate-400" size={24} /></div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="min-w-full text-left text-sm">
                        <thead>
                            <tr className="border-b border-slate-100">
                                {['Date', 'Item', 'Type', 'Reference', 'Dept', 'Qty Change', 'Recorded By'].map(h => (
                                    <th key={h} className="pb-2 pr-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {rows.length === 0 && (
                                <tr><td colSpan={7} className="py-8 text-center text-sm text-slate-400 italic">No ledger entries.</td></tr>
                            )}
                            {rows.map((row, i) => {
                                const pos = parseFloat(row.qty_change ?? 0) > 0;
                                return (
                                    <tr key={i} className="hover:bg-slate-50 transition-colors">
                                        <td className="py-2.5 pr-4 text-xs text-slate-600 whitespace-nowrap">
                                            {row.created_at ? new Date(row.created_at).toLocaleDateString('en', { dateStyle: 'medium' }) : '—'}
                                        </td>
                                        <td className="py-2.5 pr-4">
                                            <p className="text-xs font-semibold text-slate-800">{row.item_name || '—'}</p>
                                            {row.item_code && <p className="text-[10px] font-mono text-slate-400">{row.item_code}</p>}
                                        </td>
                                        <td className="py-2.5 pr-4">
                                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{KIND_LABELS[row.source_kind] || row.source_kind}</span>
                                        </td>
                                        <td className="py-2.5 pr-4 text-xs">
                                            {row.source_kind === 'internal_issue' && row.issue_number ? (
                                                <button
                                                    onClick={() => onOpenIssue?.(row.issue_number)}
                                                    title="Open issue slip"
                                                    className="text-[10px] font-bold font-mono text-orange-600 bg-orange-50 border border-orange-200 hover:bg-orange-100 px-1.5 py-0.5 rounded-md transition"
                                                >
                                                    {row.issue_number}
                                                </button>
                                            ) : (
                                                <span className="text-slate-500 font-mono">{row.reference_number || row.issue_number || row.grn_number || '—'}</span>
                                            )}
                                        </td>
                                        <td className="py-2.5 pr-4 text-xs text-slate-500">{row.department || row.issued_to_department || '—'}</td>
                                        <td className="py-2.5 pr-4 text-right">
                                            <span className={`text-xs font-bold tabular-nums ${pos ? 'text-emerald-600' : 'text-red-600'}`}>
                                                {pos ? '+' : ''}{row.qty_change}
                                            </span>
                                        </td>
                                        <td className="py-2.5 text-xs text-slate-500">{row.recorded_by_name || '—'}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </>
    );
}

// ─── Tab: Issues ─────────────────────────────────────────────────────────────
function IssuesTab({ items, initialFocus }) {
    const [deptFilter,     setDeptFilter]     = useState('');
    const [itemFilter,     setItemFilter]     = useState('');
    const [employeeFilter, setEmployeeFilter] = useState('');
    const [salaryOnly,     setSalaryOnly]     = useState(false);
    const [trimItemFilter, setTrimItemFilter] = useState('');
    const [variantFilter,  setVariantFilter]  = useState('');
    const [variantOptions, setVariantOptions] = useState([]);
    const [dateFrom,       setDateFrom]       = useState('');
    const [dateTo,         setDateTo]         = useState('');
    const [issues,         setIssues]         = useState([]);
    const [users,          setUsers]          = useState([]);
    const [trimCatalog,    setTrimCatalog]    = useState([]);
    const [loading,        setLoading]        = useState(false);
    const [err,            setErr]            = useState(null);
    const [expanded,       setExpanded]       = useState(null);

    useEffect(() => {
        // History filter includes inactive employees — past slips still reference them.
        hrApi.getAllEmployees()
            .then(r => {
                const list = r.data?.data ?? r.data ?? [];
                setUsers((Array.isArray(list) ? list : [])
                    .map(e => ({ value: e.emp_id, label: `${e.employee_name} (${e.emp_id})${e.designation ? ` · ${e.designation}` : ''}` })));
            })
            .catch(() => {});
        storeManagerApi.getAllTrimItems()
            .then(r => {
                const list = r.data?.data ?? r.data ?? [];
                setTrimCatalog(Array.isArray(list) ? list : []);
            })
            .catch(() => {});
    }, []);

    // Trim-variant filter is two-step: pick the trim item, then its variant.
    const handleTrimItemFilter = async (itemId) => {
        setTrimItemFilter(itemId);
        setVariantFilter('');
        setVariantOptions([]);
        if (!itemId) return;
        try {
            const r = await storeManagerApi.getVariantsByItem(itemId);
            const list = r.data?.data ?? r.data ?? [];
            setVariantOptions((Array.isArray(list) ? list : []).map(v => ({ value: trimVariantId(v), label: trimVariantLabel(v) })));
        } catch {
            // dropdown just stays empty
        }
    };

    const load = useCallback(async () => {
        setLoading(true); setErr(null);
        try {
            const params = {};
            if (deptFilter)     params.department            = deptFilter;
            if (itemFilter)     params.general_item_id       = itemFilter;
            if (employeeFilter) params.issued_to_employee_id = employeeFilter;
            if (salaryOnly)     params.recover_from_salary   = true;
            if (variantFilter)  params.trim_item_variant_id  = variantFilter;
            if (dateFrom)       params.date_from             = dateFrom;
            if (dateTo)         params.date_to               = dateTo;
            const r = await generalItemsApi.getIssues(params);
            setIssues(r.data?.data ?? r.data ?? []);
        } catch {
            setErr('Failed to load issues.');
        } finally {
            setLoading(false);
        }
    }, [deptFilter, itemFilter, employeeFilter, salaryOnly, variantFilter, dateFrom, dateTo]);

    useEffect(() => { load(); }, [load]);

    // Cross-link from the ledger: auto-expand the referenced slip (by id or issue number).
    useEffect(() => {
        if (!initialFocus || !issues.length) return;
        const match = issues.find(i =>
            String(i.id) === String(initialFocus) || i.issue_number === initialFocus);
        if (match) setExpanded(match.id);
    }, [initialFocus, issues]);

    return (
        <>
            <div className="flex flex-wrap items-center gap-2 mb-4">
                <div className="w-44">
                    <SearchableSelect
                        value={employeeFilter}
                        onChange={setEmployeeFilter}
                        options={[{ value: '', label: 'All employees' }, ...users]}
                        placeholder="All employees"
                        size="sm"
                    />
                </div>
                <button
                    onClick={() => setSalaryOnly(v => !v)}
                    className={`text-xs font-semibold px-3 py-2 rounded-xl border transition-all flex items-center gap-1 ${salaryOnly ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'}`}
                >
                    <IndianRupee size={11} /> Salary recovery
                </button>
                <input type="text" value={deptFilter} onChange={e => setDeptFilter(e.target.value)} placeholder="Filter by department…" className="text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:border-orange-400 w-40" />
                <div className="w-40">
                    <SearchableSelect
                        value={itemFilter}
                        onChange={setItemFilter}
                        options={[{ value: '', label: 'All general items' }, ...items.map(i => ({ value: i.id, label: i.name }))]}
                        placeholder="All general items"
                        size="sm"
                    />
                </div>
                <div className="w-40">
                    <SearchableSelect
                        value={trimItemFilter}
                        onChange={handleTrimItemFilter}
                        options={[{ value: '', label: 'All trims' }, ...trimCatalog.map(t => ({ value: t.id, label: `${t.name}${t.brand ? ` - ${t.brand}` : ''}` }))]}
                        placeholder="All trims"
                        size="sm"
                    />
                </div>
                {trimItemFilter && (
                    <div className="w-48">
                        <SearchableSelect
                            value={variantFilter}
                            onChange={setVariantFilter}
                            options={[{ value: '', label: 'All variants' }, ...variantOptions]}
                            placeholder="All variants"
                            size="sm"
                        />
                    </div>
                )}
                <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:border-orange-400" />
                <span className="text-xs text-slate-400">to</span>
                <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:border-orange-400" />
            </div>

            {/* Employee statement: employee + salary-recovery filters active → recoverable total */}
            {employeeFilter && salaryOnly && !loading && issues.length > 0 && (
                <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 mb-3 text-sm text-amber-800">
                    <IndianRupee size={13} className="shrink-0" />
                    <span>
                        Recoverable from salary: <span className="font-bold">{money(issues.reduce((s, i) => s + (parseFloat(i.total_value) || 0), 0))}</span>
                        {' '}across {issues.length} slip{issues.length !== 1 ? 's' : ''}
                    </span>
                </div>
            )}

            {err && <p className="text-xs text-red-600 mb-3">{err}</p>}

            {loading ? (
                <div className="flex justify-center py-10"><Loader2 className="animate-spin text-slate-400" size={24} /></div>
            ) : (
                <div className="space-y-1.5">
                    {issues.length === 0 && (
                        <p className="text-center text-sm text-slate-400 italic py-8">No issues found.</p>
                    )}
                    {issues.map(iss => (
                        <div key={iss.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                            <button
                                className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors text-left gap-2"
                                onClick={() => setExpanded(prev => prev === iss.id ? null : iss.id)}
                            >
                                <div className="flex items-center gap-3 flex-wrap min-w-0">
                                    <span className="text-xs font-bold text-slate-800">{iss.issue_number || `#${iss.id}`}</span>
                                    <span className="text-[11px] text-slate-500">
                                        {iss.issued_to_name || '—'}
                                        {iss.issued_to_department ? ` · ${iss.issued_to_department}` : ''}
                                    </span>
                                    {iss.recover_from_salary && (
                                        <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-md uppercase tracking-wider" title="Recover from salary">
                                            <IndianRupee size={8} /> Salary
                                        </span>
                                    )}
                                    {iss.issued_by_name && (
                                        <span className="text-[10px] text-slate-400">by {iss.issued_by_name}</span>
                                    )}
                                    <span className="text-[10px] text-slate-400">
                                        {iss.created_at ? new Date(iss.created_at).toLocaleDateString('en', { dateStyle: 'medium' }) : '—'}
                                    </span>
                                    <span className="text-[10px] text-slate-400">
                                        {(iss.lines || []).length} line{(iss.lines || []).length !== 1 ? 's' : ''}
                                    </span>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    {iss.total_value != null && (
                                        <span className="text-xs font-bold text-slate-700 tabular-nums">{money(iss.total_value)}</span>
                                    )}
                                    <ChevronDown size={13} className={`text-slate-400 transition-transform ${expanded === iss.id ? 'rotate-180' : ''}`} />
                                </div>
                            </button>
                            {expanded === iss.id && (
                                <div className="border-t border-slate-100 px-4 py-3 space-y-2">
                                    <table className="w-full text-xs">
                                        <thead>
                                            <tr className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                                                <th className="text-left pb-1.5">Item</th>
                                                <th className="text-right pb-1.5">Qty</th>
                                                <th className="text-right pb-1.5">Unit Cost</th>
                                                <th className="text-right pb-1.5">Value</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-50">
                                            {(iss.lines || []).map((line, j) => {
                                                const isTrim = line.item_kind === 'trim';
                                                const variantBits = isTrim
                                                    ? [line.variant_color_name, line.variant_size].filter(Boolean).join(' / ')
                                                    : '';
                                                return (
                                                <tr key={line.id ?? j}>
                                                    <td className="py-1.5 text-slate-700">
                                                        <span className={`text-[9px] font-bold uppercase tracking-wider px-1 py-0.5 rounded mr-1.5 ${isTrim ? 'bg-violet-100 text-violet-700' : 'bg-slate-100 text-slate-500'}`}>
                                                            {isTrim ? 'Trim' : 'General'}
                                                        </span>
                                                        {line.item_name || (isTrim ? `Variant #${line.trim_item_variant_id}` : `Item #${line.general_item_id}`)}
                                                        {variantBits && <span className="text-slate-500"> — {variantBits}</span>}
                                                        {line.item_code && <span className="text-[10px] font-mono text-slate-400 ml-1">{line.item_code}</span>}
                                                    </td>
                                                    <td className="py-1.5 text-right font-semibold text-slate-800 tabular-nums whitespace-nowrap">
                                                        {qtyNum(line.qty)} {line.uom || ''}
                                                    </td>
                                                    <td className="py-1.5 text-right text-slate-500 tabular-nums">{money(line.unit_cost)}</td>
                                                    <td className="py-1.5 text-right font-semibold text-slate-800 tabular-nums">
                                                        {line.unit_cost != null ? money(line.line_value) : '—'}
                                                    </td>
                                                </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                    {iss.notes && <p className="text-[11px] text-slate-400 italic">{iss.notes}</p>}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </>
    );
}

// ─── Main Page ───────────────────────────────────────────────────────────────
const TABS = [
    { key: 'items',  label: 'Items',  icon: Package },
    { key: 'ledger', label: 'Ledger', icon: BookOpen },
    { key: 'issues', label: 'Issues', icon: ClipboardList },
];

export default function GeneralItemsPage() {
    const { user } = useAuth();
    const isAdmin = user?.role === 'factory_admin';

    const [tab,        setTab]        = useState('items');
    const [items,      setItems]      = useState([]);
    const [categories, setCategories] = useState([]);
    const [loading,    setLoading]    = useState(true);
    const [toast,      setToast]      = useState(null);
    const [focusIssue, setFocusIssue] = useState(null); // ledger → issues cross-link (id or issue_number)

    const openIssue = (ref) => { setFocusIssue(ref); setTab('issues'); };

    useEffect(() => {
        if (!toast) return;
        const t = setTimeout(() => setToast(null), 3000);
        return () => clearTimeout(t);
    }, [toast]);

    const fetchItems = useCallback(async () => {
        setLoading(true);
        try {
            const [ir, cr] = await Promise.all([
                generalItemsApi.getItems(),
                generalItemsApi.getCategories(),
            ]);
            setItems(ir.data?.data ?? ir.data ?? []);
            setCategories(cr.data?.data ?? cr.data ?? []);
        } catch {
            // silently ignore
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchItems(); }, [fetchItems]);

    const lowStockCount = items.filter(i => i.low_stock_threshold > 0 && i.current_stock <= i.low_stock_threshold).length;

    return (
        <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                        <Package size={20} className="text-orange-500" />
                        General Items
                    </h1>
                    <p className="text-sm text-slate-500 mt-0.5">Consumables, supplies, and miscellaneous stock</p>
                </div>
                {isAdmin && (
                    <Link
                        to="/admin/general-items"
                        title="Opens Admin portal — item master, categories & deactivation"
                        className="flex items-center gap-1.5 text-xs font-bold text-slate-600 border border-slate-200 bg-white hover:bg-slate-50 px-3 py-2 rounded-xl transition"
                    >
                        <Settings2 size={12} /> Manage Master List <ArrowUpRight size={11} className="opacity-60" />
                    </Link>
                )}
            </div>

            {lowStockCount > 0 && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-100 rounded-xl px-4 py-2.5 text-sm text-red-600">
                    <AlertTriangle size={14} className="shrink-0" />
                    <span><span className="font-bold">{lowStockCount}</span> item{lowStockCount !== 1 ? 's' : ''} below low-stock threshold</span>
                </div>
            )}

            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                {/* Tab bar */}
                <div className="flex border-b border-slate-100">
                    {TABS.map(t => {
                        const Icon = t.icon;
                        return (
                            <button
                                key={t.key}
                                onClick={() => setTab(t.key)}
                                className={`flex items-center gap-1.5 px-4 py-3 text-xs font-bold border-b-2 transition-all ${
                                    tab === t.key
                                        ? 'border-orange-500 text-orange-600'
                                        : 'border-transparent text-slate-400 hover:text-slate-600'
                                }`}
                            >
                                <Icon size={13} />
                                {t.label}
                            </button>
                        );
                    })}
                </div>

                <div className="p-5">
                    {tab === 'items'  && <ItemsTab  items={items} categories={categories} loading={loading} onRefresh={fetchItems} showToast={setToast} isAdmin={isAdmin} />}
                    {tab === 'ledger' && <LedgerTab items={items} onOpenIssue={openIssue} />}
                    {tab === 'issues' && <IssuesTab items={items} initialFocus={focusIssue} />}
                </div>
            </div>

            <Toast toast={toast} />
        </div>
    );
}

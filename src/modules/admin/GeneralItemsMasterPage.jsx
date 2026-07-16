import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
    Package, Search, Plus, AlertTriangle, Loader2, CheckCircle2,
    ArrowUpRight, Tags, Pencil, Ban, RotateCcw,
    FileSpreadsheet, Upload, Check,
} from 'lucide-react';
import { generalItemsApi } from '../../api/generalItemsApi';
import { CreateEditModal } from '../store_manager/GeneralItemsPage';

const money = (v) => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : '—';
};

// ─── CSV helpers (mirror TrimManagementPage export/import) ────────────────────
const downloadAsExcel = (data, fileName = 'general_items.csv') => {
    if (!data || !data.length) return alert('No data available to export.');
    const headers = Object.keys(data[0]);
    const csvContent = [
        headers.join(','),
        ...data.map(row =>
            headers.map(fieldName => {
                const val = row[fieldName] === null || row[fieldName] === undefined ? '' : row[fieldName].toString();
                return `"${val.replace(/"/g, '""')}"`;
            }).join(',')
        ),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    if (link.download !== undefined) {
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', fileName);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
};

// Robust CSV parser that handles commas/quotes inside a cell.
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
            else if (str[i] === ',') { result.push(cur); cur = ''; }
            else { cur += str[i]; }
        }
    }
    result.push(cur);
    return result;
};

const parseCSV = (csvText) => {
    const lines = csvText.split(/\r?\n/).filter(line => line.trim() !== '');
    if (lines.length < 2) return [];
    const headers = parseCSVRow(lines[0]).map(h => h.trim());
    return lines.slice(1).map(line => {
        const values = parseCSVRow(line);
        return headers.reduce((obj, header, index) => {
            obj[header] = values[index];
            return obj;
        }, {});
    });
};

// Cell is "present" when it has a non-empty value — empty cells leave the field alone.
const has = (v) => v !== undefined && v !== null && String(v).trim() !== '';
const parseBool = (v) => {
    const s = String(v).trim().toLowerCase();
    return ['true', 'yes', '1', 'active', 'y'].includes(s);
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

// ─── Categories panel ────────────────────────────────────────────────────────
function CategoriesPanel({ categories, items, onAdded, showToast }) {
    const [name, setName] = useState('');
    const [busy, setBusy] = useState(false);

    const counts = useMemo(() => {
        const m = {};
        items.forEach(it => {
            if (it.category_id != null) m[it.category_id] = (m[it.category_id] || 0) + 1;
        });
        return m;
    }, [items]);

    const handleAdd = async () => {
        if (!name.trim()) return;
        setBusy(true);
        try {
            await generalItemsApi.createCategory({ name: name.trim() });
            setName('');
            onAdded();
            showToast({ kind: 'success', message: 'Category added.' });
        } catch (e) {
            showToast({ kind: 'error', message: e?.response?.data?.error || 'Failed to add category.' });
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 h-fit">
            <h2 className="text-xs font-bold text-slate-800 flex items-center gap-1.5 mb-3">
                <Tags size={13} className="text-orange-500" /> Categories
            </h2>
            <div className="flex gap-1.5 mb-3">
                <input
                    type="text" value={name} onChange={e => setName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAdd()}
                    placeholder="New category name"
                    className="flex-1 min-w-0 text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:border-orange-400"
                />
                <button onClick={handleAdd} disabled={busy || !name.trim()} className="text-xs font-bold text-white bg-orange-500 hover:bg-orange-600 disabled:opacity-40 px-3 py-2 rounded-xl transition">
                    {busy ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                </button>
            </div>
            <div className="space-y-1">
                {categories.length === 0 && <p className="text-xs text-slate-400 italic py-2">No categories yet.</p>}
                {categories.map(c => (
                    <div key={c.id} className="flex items-center justify-between text-xs px-2.5 py-1.5 rounded-lg hover:bg-slate-50">
                        <span className="font-semibold text-slate-700">{c.name}</span>
                        <span className="text-[10px] text-slate-400 tabular-nums">{counts[c.id] || 0} item{(counts[c.id] || 0) !== 1 ? 's' : ''}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ─── Main Page ───────────────────────────────────────────────────────────────
export default function GeneralItemsMasterPage() {
    const [items,      setItems]      = useState([]);
    const [categories, setCategories] = useState([]);
    const [loading,    setLoading]    = useState(true);
    const [toast,      setToast]      = useState(null);
    const [q,          setQ]          = useState('');
    const [catFilter,  setCatFilter]  = useState('');
    const [status,     setStatus]     = useState('all'); // all | active | inactive
    const [modal,      setModal]      = useState(null);  // null | 'create' | 'edit'
    const [selected,   setSelected]   = useState(null);
    const [togglingId, setTogglingId] = useState(null);
    const [isExporting,   setIsExporting]   = useState(false);
    const [isImporting,   setIsImporting]   = useState(false);
    const [importPreview, setImportPreview] = useState(null); // { updates, fileName, totalRows } | null
    const fileInputRef = useRef(null);

    useEffect(() => {
        if (!toast) return;
        const t = setTimeout(() => setToast(null), 3000);
        return () => clearTimeout(t);
    }, [toast]);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [ir, cr] = await Promise.all([
                generalItemsApi.getItems(),
                generalItemsApi.getCategories(),
            ]);
            setItems(ir.data?.data ?? ir.data ?? []);
            setCategories(cr.data?.data ?? cr.data ?? []);
        } catch {
            setToast({ kind: 'error', message: 'Failed to load master list.' });
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const filtered = useMemo(() => items.filter(it => {
        const active = it.is_active !== false;
        if (status === 'active' && !active) return false;
        if (status === 'inactive' && active) return false;
        if (catFilter && String(it.category_id) !== catFilter) return false;
        if (q) {
            const s = q.toLowerCase();
            if (!(it.name?.toLowerCase().includes(s) || it.item_code?.toLowerCase().includes(s))) return false;
        }
        return true;
    }), [items, q, catFilter, status]);

    const inactiveCount = items.filter(it => it.is_active === false).length;

    // No hard delete on the backend by design — the ledger and issue history must
    // survive. "Delete" here is a soft deactivate via PATCH is_active.
    const toggleActive = async (it) => {
        const next = !(it.is_active !== false);
        setTogglingId(it.id);
        try {
            await generalItemsApi.updateItem(it.id, { is_active: next });
            setItems(prev => prev.map(p => p.id === it.id ? { ...p, is_active: next } : p));
            setToast({ kind: 'success', message: `"${it.name}" ${next ? 'reactivated' : 'deactivated'}.` });
        } catch (e) {
            setToast({ kind: 'error', message: e?.response?.data?.error || 'Update failed.' });
        } finally {
            setTogglingId(null);
        }
    };

    const handleSaved = () => {
        setModal(null);
        setSelected(null);
        load();
        setToast({ kind: 'success', message: 'Item saved.' });
    };

    // ─── Export / Import ─────────────────────────────────────────────────────
    const handleExport = async () => {
        setIsExporting(true);
        try {
            const res = await generalItemsApi.exportInventory();
            const rows = res.data?.data ?? res.data ?? [];
            const date = new Date().toISOString().split('T')[0];
            downloadAsExcel(rows, `General_Items_Export_${date}.csv`);
            setToast({ kind: 'success', message: 'Inventory exported.' });
        } catch (e) {
            setToast({ kind: 'error', message: e?.response?.data?.error || 'Export failed.' });
        } finally {
            setIsExporting(false);
        }
    };

    const handleImportClick = () => fileInputRef.current?.click();

    const handleFileUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setIsImporting(true);
        const reader = new FileReader();

        reader.onload = (event) => {
            try {
                const parsed = parseCSV(event.target.result);
                if (parsed.length === 0) throw new Error('The CSV file is empty or invalid.');
                if (!('ID' in parsed[0])) throw new Error("The CSV must contain an 'ID' column. Download the template via Export first.");

                // Map human-readable columns back to the bulk-update payload.
                // Only non-empty cells become fields — omit a column → left alone.
                const updates = parsed.map(row => {
                    const u = { id: parseInt(row['ID'], 10) };
                    if (has(row['Name']))                 u.name = row['Name'].trim();
                    if (has(row['Item Code']))            u.item_code = row['Item Code'].trim();
                    if (has(row['Category ID']))          u.category_id = parseInt(row['Category ID'], 10);
                    if (has(row['UOM']))                  u.uom = row['UOM'].trim();
                    if (has(row['Unit Cost']))            u.unit_cost = parseFloat(row['Unit Cost']);
                    if (has(row['Low Stock Alert Limit'])) u.low_stock_threshold = parseFloat(row['Low Stock Alert Limit']);
                    if (has(row['Active']))               u.is_active = parseBool(row['Active']);
                    if (has(row['Current Stock']))        u.stock = parseFloat(row['Current Stock']);
                    return u;
                }).filter(u => !isNaN(u.id));

                if (updates.length === 0) throw new Error('No valid item IDs found to update.');

                // Stage as a preview — the user reviews and clicks Apply.
                setImportPreview({ updates, fileName: file.name, totalRows: parsed.length });
                setToast({ kind: 'success', message: `Parsed ${updates.length} row${updates.length === 1 ? '' : 's'}. Review and apply.` });
            } catch (err) {
                setToast({ kind: 'error', message: `Import failed: ${err.message}` });
            } finally {
                setIsImporting(false);
                e.target.value = null;
            }
        };
        reader.onerror = () => {
            setToast({ kind: 'error', message: 'Failed to read the file.' });
            setIsImporting(false);
        };
        reader.readAsText(file);
    };

    const applyImportPreview = async () => {
        if (!importPreview?.updates?.length) return;
        setIsImporting(true);
        try {
            const res = await generalItemsApi.bulkUpdateInventory({ updates: importPreview.updates });
            setToast({ kind: 'success', message: res.data?.message || `Applied ${importPreview.updates.length} update(s).` });
            setImportPreview(null);
            load();
        } catch (e) {
            setToast({ kind: 'error', message: `Import failed: ${e?.response?.data?.error || e.message}` });
        } finally {
            setIsImporting(false);
        }
    };

    return (
        <div className="max-w-6xl mx-auto space-y-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                        <Package size={20} className="text-orange-500" />
                        General Items — Master List
                    </h1>
                    <p className="text-sm text-slate-500 mt-0.5">
                        Manage the item master: create, edit, categorize, and deactivate. Stock itself only moves via purchase inwards and issue slips.
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <input
                        type="file"
                        accept=".csv"
                        ref={fileInputRef}
                        onChange={handleFileUpload}
                        className="hidden"
                    />
                    <button
                        onClick={handleImportClick}
                        disabled={isImporting}
                        title="Bulk-update items from a CSV (rows matched by ID)"
                        className="flex items-center gap-1.5 text-xs font-bold text-indigo-700 border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 px-3 py-2 rounded-xl transition disabled:opacity-50"
                    >
                        {isImporting ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                        {isImporting ? 'Importing…' : 'Import CSV'}
                    </button>
                    <button
                        onClick={handleExport}
                        disabled={isExporting}
                        title="Export the item master to CSV"
                        className="flex items-center gap-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 px-3 py-2 rounded-xl transition disabled:opacity-50"
                    >
                        {isExporting ? <Loader2 size={13} className="animate-spin" /> : <FileSpreadsheet size={13} />}
                        {isExporting ? 'Exporting…' : 'Export'}
                    </button>
                    <Link
                        to="/store-manager/general-items"
                        title="Opens Store Manager portal"
                        className="flex items-center gap-1 text-xs font-bold text-slate-600 border border-slate-200 bg-white hover:bg-slate-50 px-3 py-2 rounded-xl transition"
                    >
                        Store view — stock, ledger & issues <ArrowUpRight size={12} className="opacity-60" />
                    </Link>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-5 items-start">
                <div className="bg-white rounded-2xl border border-slate-200 p-5">
                    <div className="flex flex-wrap items-center gap-2 mb-4">
                        <div className="relative flex-1 min-w-[180px]">
                            <Search size={13} className="absolute left-3 top-2.5 text-slate-400" />
                            <input type="text" value={q} onChange={e => setQ(e.target.value)} placeholder="Search name or code…" className="w-full text-sm pl-8 pr-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:border-orange-400" />
                        </div>
                        <select value={catFilter} onChange={e => setCatFilter(e.target.value)} className="text-sm border border-slate-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:border-orange-400">
                            <option value="">All categories</option>
                            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                        <div className="flex rounded-xl border border-slate-200 overflow-hidden">
                            {[['all', 'All'], ['active', 'Active'], ['inactive', `Inactive${inactiveCount ? ` (${inactiveCount})` : ''}`]].map(([k, label]) => (
                                <button
                                    key={k} onClick={() => setStatus(k)}
                                    className={`text-xs font-semibold px-3 py-2 transition ${status === k ? 'bg-orange-500 text-white' : 'bg-white text-slate-500 hover:text-slate-700'}`}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                        <button onClick={() => { setSelected(null); setModal('create'); }} className="ml-auto text-xs font-bold text-white bg-orange-500 hover:bg-orange-600 px-3 py-2 rounded-xl transition flex items-center gap-1.5">
                            <Plus size={12} /> New Item
                        </button>
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
                                        <th className="pb-2 pr-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-right hidden md:table-cell">Unit Cost</th>
                                        <th className="pb-2 pr-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-right hidden md:table-cell">Threshold</th>
                                        <th className="pb-2 pr-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-right">Stock</th>
                                        <th className="pb-2 pr-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-center">Status</th>
                                        <th className="pb-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {filtered.length === 0 && (
                                        <tr><td colSpan={7} className="py-8 text-center text-sm text-slate-400 italic">No items found.</td></tr>
                                    )}
                                    {filtered.map(it => {
                                        const active = it.is_active !== false;
                                        return (
                                            <tr key={it.id} className={`transition-colors hover:bg-slate-50 ${!active ? 'opacity-60' : ''}`}>
                                                <td className="py-2.5 pr-4">
                                                    <p className="font-bold text-slate-800 text-xs">{it.name}</p>
                                                    <div className="flex items-center gap-1.5 mt-0.5">
                                                        {it.item_code && <span className="text-[10px] font-mono text-slate-500 bg-slate-100 px-1 py-0.5 rounded">{it.item_code}</span>}
                                                        {it.uom && <span className="text-[10px] text-slate-400">{it.uom}</span>}
                                                    </div>
                                                </td>
                                                <td className="py-2.5 pr-4 text-xs text-slate-500 hidden sm:table-cell">{it.category_name || '—'}</td>
                                                <td className="py-2.5 pr-4 text-right text-xs text-slate-700 tabular-nums hidden md:table-cell">{money(it.unit_cost)}</td>
                                                <td className="py-2.5 pr-4 text-right text-xs text-slate-500 tabular-nums hidden md:table-cell">{it.low_stock_threshold ?? '—'}</td>
                                                <td className="py-2.5 pr-4 text-right text-xs font-bold text-slate-700 tabular-nums" title="Read-only — changes only through inwards and issue slips">
                                                    {it.current_stock ?? 0}
                                                </td>
                                                <td className="py-2.5 pr-4 text-center">
                                                    <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md border ${active ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : 'text-slate-500 bg-slate-100 border-slate-200'}`}>
                                                        {active ? 'Active' : 'Inactive'}
                                                    </span>
                                                </td>
                                                <td className="py-2.5 text-right whitespace-nowrap">
                                                    <button onClick={() => { setSelected(it); setModal('edit'); }} className="text-[10px] font-bold text-slate-500 hover:text-orange-600 border border-slate-200 hover:border-orange-200 px-2 py-1 rounded-lg transition inline-flex items-center gap-1">
                                                        <Pencil size={10} /> Edit
                                                    </button>
                                                    <button
                                                        onClick={() => toggleActive(it)}
                                                        disabled={togglingId === it.id}
                                                        title={active ? 'Deactivate — hides the item from new issues; history is kept' : 'Reactivate item'}
                                                        className={`ml-1.5 text-[10px] font-bold border px-2 py-1 rounded-lg transition inline-flex items-center gap-1 disabled:opacity-40 ${
                                                            active
                                                                ? 'text-slate-500 hover:text-red-600 border-slate-200 hover:border-red-200'
                                                                : 'text-slate-500 hover:text-emerald-600 border-slate-200 hover:border-emerald-200'
                                                        }`}
                                                    >
                                                        {togglingId === it.id ? <Loader2 size={10} className="animate-spin" /> : active ? <Ban size={10} /> : <RotateCcw size={10} />}
                                                        {active ? 'Deactivate' : 'Reactivate'}
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                <CategoriesPanel categories={categories} items={items} onAdded={load} showToast={setToast} />
            </div>

            {(modal === 'create' || modal === 'edit') && (
                <CreateEditModal
                    item={modal === 'edit' ? selected : null}
                    categories={categories}
                    onSaved={handleSaved}
                    onClose={() => { setModal(null); setSelected(null); }}
                />
            )}

            {importPreview && (
                <div className="fixed inset-0 bg-black/60 z-50 flex justify-center items-center p-4" onClick={() => !isImporting && setImportPreview(null)}>
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
                        <div className="px-5 py-4 border-b border-slate-100">
                            <h2 className="text-base font-bold text-slate-800">Review Import</h2>
                            <p className="text-xs text-slate-500 mt-0.5">
                                <span className="font-mono">{importPreview.fileName}</span> · parsed {importPreview.totalRows} row{importPreview.totalRows === 1 ? '' : 's'} · <span className="font-bold text-indigo-600">{importPreview.updates.length}</span> valid update{importPreview.updates.length === 1 ? '' : 's'}. Empty cells are left unchanged; a changed stock value is recorded as a ledger correction.
                            </p>
                        </div>
                        <div className="flex-1 overflow-auto px-5 py-3">
                            <table className="w-full text-xs">
                                <thead className="text-[10px] font-bold text-slate-400 uppercase tracking-wider sticky top-0 bg-white border-b border-slate-100">
                                    <tr>
                                        <th className="text-left py-2 pr-3">ID</th>
                                        <th className="text-left py-2 pr-3">Name</th>
                                        <th className="text-left py-2 pr-3">Code</th>
                                        <th className="text-right py-2 pr-3">Cat ID</th>
                                        <th className="text-left py-2 pr-3">UOM</th>
                                        <th className="text-right py-2 pr-3">Unit Cost</th>
                                        <th className="text-right py-2 pr-3">Threshold</th>
                                        <th className="text-right py-2 pr-3">Stock</th>
                                        <th className="text-center py-2">Active</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {importPreview.updates.slice(0, 100).map((u, i) => {
                                        const dash = <span className="text-slate-300">—</span>;
                                        return (
                                            <tr key={i} className="hover:bg-slate-50">
                                                <td className="py-1.5 pr-3 font-mono">{u.id}</td>
                                                <td className="py-1.5 pr-3">{u.name ?? dash}</td>
                                                <td className="py-1.5 pr-3 font-mono">{u.item_code ?? dash}</td>
                                                <td className="py-1.5 pr-3 text-right tabular-nums">{u.category_id ?? dash}</td>
                                                <td className="py-1.5 pr-3">{u.uom ?? dash}</td>
                                                <td className="py-1.5 pr-3 text-right tabular-nums">{u.unit_cost != null ? Number(u.unit_cost).toFixed(2) : dash}</td>
                                                <td className="py-1.5 pr-3 text-right tabular-nums">{u.low_stock_threshold ?? dash}</td>
                                                <td className="py-1.5 pr-3 text-right tabular-nums font-bold">{u.stock ?? dash}</td>
                                                <td className="py-1.5 text-center">{u.is_active == null ? dash : u.is_active ? 'Yes' : 'No'}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                            {importPreview.updates.length > 100 && (
                                <p className="text-[10px] text-slate-400 italic text-center py-2">
                                    Showing first 100 rows. {importPreview.updates.length - 100} more will be applied.
                                </p>
                            )}
                        </div>
                        <div className="px-5 py-3 border-t border-slate-100 flex justify-end gap-2">
                            <button onClick={() => setImportPreview(null)} disabled={isImporting} className="px-4 py-2 text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition disabled:opacity-40">Cancel</button>
                            <button onClick={applyImportPreview} disabled={isImporting}
                                className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 rounded-xl transition shadow-sm">
                                {isImporting ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                                Apply {importPreview.updates.length} update{importPreview.updates.length === 1 ? '' : 's'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <Toast toast={toast} />
        </div>
    );
}

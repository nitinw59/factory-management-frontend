import { useState, useEffect, useCallback, useMemo } from 'react';
import { qcApi } from '../../api/qcApi';
import { productionManagerApi } from '../../api/productionManagerApi';
import { Loader2, AlertCircle, Check, Save, Search, Plus, X } from 'lucide-react';

const DefectCodeLineTypePage = () => {
    const [lineTypes, setLineTypes] = useState([]);      // [{ id, name }]
    const [defectCodes, setDefectCodes] = useState([]);  // [{ id, code, description }]
    // matrix: { [lineTypeId]: Set<defectCodeId> }
    const [matrix, setMatrix] = useState({});
    const [dirty, setDirty] = useState(new Set());       // lineTypeIds with unsaved changes
    const [saving, setSaving] = useState(new Set());     // lineTypeIds currently saving
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [search, setSearch] = useState('');
    const [saveStatus, setSaveStatus] = useState({});    // { [lineTypeId]: 'ok' | 'err' }
    const [showAddModal, setShowAddModal] = useState(false);
    const [newCategory, setNewCategory] = useState('');       // existing category name or 'NEW'
    const [newCategoryName, setNewCategoryName] = useState(''); // only when newCategory === 'NEW'
    const [newCode, setNewCode] = useState('');
    const [newDescription, setNewDescription] = useState('');
    const [addSaving, setAddSaving] = useState(false);
    const [addError, setAddError] = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [ltRes, dcRes] = await Promise.all([
                productionManagerApi.getLineTypes(),
                qcApi.getAllDefectCodes(),
            ]);
            console.log('Line types:', ltRes.data);
            console.log('Defect codes:', dcRes.data);
            const lts = ltRes.data || [];
            const dcs = dcRes.data || [];
            setLineTypes(lts);
            setDefectCodes(dcs);

            // Fetch mappings for every line type in parallel
            // Normalize all IDs to strings to avoid Set.has() type-mismatch (e.g. "14" vs 14)
            const mappings = await Promise.allSettled(
                lts.map(lt => qcApi.getDefectCodesForLineType(lt.id).then(r => ({
                    ltId: String(lt.id),
                    ids: (r.data || []).map(d => String(d.id)),
                })))
            );
            const newMatrix = {};
            mappings.forEach(r => {
                if (r.status === 'fulfilled') {
                    newMatrix[r.value.ltId] = new Set(r.value.ids);
                }
            });
            setMatrix(newMatrix);
        } catch (e) {
            setError('Failed to load data.');
            console.error(e);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    // Toggle a single cell
    const toggle = (lineTypeId, defectCodeId) => {
        const ltKey = String(lineTypeId);
        const dcKey = String(defectCodeId);
        setMatrix(prev => {
            const current = new Set(prev[ltKey] || []);
            current.has(dcKey) ? current.delete(dcKey) : current.add(dcKey);
            return { ...prev, [ltKey]: current };
        });
        setDirty(prev => new Set(prev).add(ltKey));
    };

    // Select all / deselect all for a line type column
    const toggleAllForLineType = (lineTypeId, filteredDefectCodes) => {
        const ltKey = String(lineTypeId);
        const allIds = filteredDefectCodes.map(d => String(d.id));
        setMatrix(prev => {
            const current = prev[ltKey] || new Set();
            const allSelected = allIds.every(id => current.has(id));
            const next = new Set(current);
            if (allSelected) allIds.forEach(id => next.delete(id));
            else allIds.forEach(id => next.add(id));
            return { ...prev, [ltKey]: next };
        });
        setDirty(prev => new Set(prev).add(ltKey));
    };

    // Save a single column
    const saveColumn = async (lineTypeId) => {
        const ltKey = String(lineTypeId);
        setSaving(prev => new Set(prev).add(ltKey));
        setSaveStatus(prev => ({ ...prev, [ltKey]: null }));
        try {
            const ids = Array.from(matrix[ltKey] || []);
            await qcApi.setDefectCodesForLineType(lineTypeId, ids);
            setDirty(prev => { const n = new Set(prev); n.delete(ltKey); return n; });
            setSaveStatus(prev => ({ ...prev, [ltKey]: 'ok' }));
            setTimeout(() => setSaveStatus(prev => ({ ...prev, [ltKey]: null })), 2000);
        } catch {
            setSaveStatus(prev => ({ ...prev, [ltKey]: 'err' }));
        } finally {
            setSaving(prev => { const n = new Set(prev); n.delete(ltKey); return n; });
        }
    };

    // Save all dirty columns
    const saveAll = async () => {
        await Promise.allSettled([...dirty].map(ltId => saveColumn(ltId)));
    };

    const handleAddDefectCode = async (e) => {
        e.preventDefault();
        const effectiveCategory = newCategory === 'NEW' ? newCategoryName.trim().toUpperCase() : newCategory;
        if (!newCode.trim() || !effectiveCategory) return;
        setAddSaving(true);
        setAddError(null);
        try {
            await qcApi.createDefectCode({ code: newCode.trim(), description: newDescription.trim(), category: effectiveCategory });
            setNewCategory('');
            setNewCategoryName('');
            setNewCode('');
            setNewDescription('');
            setShowAddModal(false);
            await load();
        } catch {
            setAddError('Failed to create defect code.');
        } finally {
            setAddSaving(false);
        }
    };

    const openAddModal = () => {
        setNewCategory('');
        setNewCategoryName('');
        setNewCode('');
        setNewDescription('');
        setAddError(null);
        setShowAddModal(true);
    };

    const handleCategoryChange = (val) => {
        setNewCategory(val);
        setNewCategoryName('');
        if (val && val !== 'NEW') {
            setNewCode(suggestNextCode(val));
        } else {
            setNewCode('');
        }
    };

    const handleNewCategoryNameChange = (val) => {
        setNewCategoryName(val);
        setNewCode(suggestCodeForNewCategory(val));
    };

    const filteredDefectCodes = useMemo(() => {
        if (!search) return defectCodes;
        const lower = search.toLowerCase();
        return defectCodes.filter(d =>
            d.code?.toLowerCase().includes(lower) ||
            d.description?.toLowerCase().includes(lower)
        );
    }, [defectCodes, search]);

    // Distinct sorted categories derived from loaded defect codes
    const categories = useMemo(() => {
        const cats = [...new Set(defectCodes.map(d => d.category).filter(Boolean))].sort();
        return cats;
    }, [defectCodes]);

    // Suggest the next code for a given existing category
    const suggestNextCode = useCallback((category) => {
        const inCat = defectCodes.filter(d => d.category === category && d.code?.includes('-'));
        if (inCat.length === 0) return '';
        const prefix = inCat[0].code.split('-')[0];
        const maxNum = Math.max(...inCat.map(d => parseInt(d.code.split('-')[1]) || 0));
        return `${prefix}-${String(maxNum + 1).padStart(3, '0')}`;
    }, [defectCodes]);

    // Suggest prefix-001 for a brand-new category name
    const suggestCodeForNewCategory = (name) => {
        if (!name.trim()) return '';
        return `${name.trim().substring(0, 3).toUpperCase()}-001`;
    };

    if (loading) return (
        <div className="flex justify-center items-center p-16">
            <Loader2 className="animate-spin h-10 w-10 text-indigo-500" />
        </div>
    );
    if (error) return (
        <div className="flex items-center gap-3 p-5 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm m-6">
            <AlertCircle size={18} /> {error}
        </div>
    );

    const allLinkedCount = lineTypes.reduce((s, lt) => s + (matrix[String(lt.id)]?.size || 0), 0);

    return (
        <div className="p-6 bg-slate-50 min-h-screen font-inter">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                <div>
                    <h1 className="text-2xl font-extrabold text-slate-900">Defect Codes × Line Types</h1>
                    <p className="text-slate-500 text-sm mt-1">
                        {defectCodes.length} defect codes · {lineTypes.length} line types · {allLinkedCount} total links
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={openAddModal}
                        className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-bold shadow-sm transition-colors"
                    >
                        <Plus size={15} /> New Defect Code
                    </button>
                    {dirty.size > 0 && (
                        <button
                            onClick={saveAll}
                            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-bold shadow-sm transition-colors"
                        >
                            <Save size={15} /> Save All ({dirty.size} changed)
                        </button>
                    )}
                </div>
            </div>

            {/* Search */}
            <div className="relative mb-4 max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                <input
                    type="text"
                    placeholder="Filter defect codes..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="w-full pl-8 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                />
            </div>

            {/* Matrix table */}
            <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm bg-white">
                <table className="w-full border-collapse text-sm">
                    <thead>
                        <tr className="bg-slate-900 text-white">
                            {/* Defect code label column */}
                            <th className="sticky left-0 z-10 bg-slate-900 text-left px-4 py-3 font-bold text-xs uppercase tracking-widest min-w-[220px] border-r border-slate-700">
                                Defect Code
                            </th>
                            {lineTypes.map(lt => {
                                const ltKey = String(lt.id);
                                const colLinked = (matrix[ltKey]?.size || 0);
                                const isDirty = dirty.has(ltKey);
                                const isSaving = saving.has(ltKey);
                                const status = saveStatus[ltKey];
                                return (
                                    <th key={lt.id} className="px-3 py-3 text-center font-bold text-xs uppercase tracking-widest min-w-[120px] border-r border-slate-700 last:border-r-0">
                                        <div className="flex flex-col items-center gap-1">
                                            <span className="leading-tight">{lt.type_name}</span>
                                            <span className="text-[10px] font-normal text-slate-300 normal-case tracking-normal">{colLinked} linked</span>
                                            {/* Per-column save button */}
                                            <button
                                                onClick={() => saveColumn(lt.id)}
                                                disabled={!isDirty || isSaving}
                                                className={`mt-1 px-2 py-0.5 rounded text-[10px] font-bold transition-colors flex items-center gap-1 ${
                                                    status === 'ok'
                                                        ? 'bg-emerald-500 text-white'
                                                        : status === 'err'
                                                        ? 'bg-red-500 text-white'
                                                        : isDirty
                                                        ? 'bg-amber-400 text-black hover:bg-amber-300'
                                                        : 'bg-slate-700 text-slate-400 cursor-default'
                                                }`}
                                            >
                                                {isSaving ? (
                                                    <Loader2 className="animate-spin h-2.5 w-2.5" />
                                                ) : status === 'ok' ? (
                                                    <><Check size={10} />Saved</>
                                                ) : (
                                                    <>{isDirty ? <><Save size={10} />Save</> : 'Saved'}</>
                                                )}
                                            </button>
                                        </div>
                                    </th>
                                );
                            })}
                        </tr>

                        {/* Select-all row */}
                        <tr className="bg-slate-800 text-white border-b border-slate-700">
                            <td className="sticky left-0 z-10 bg-slate-800 px-4 py-2 text-xs font-black uppercase tracking-widest text-slate-300 border-r border-slate-700">
                                Select All
                            </td>
                            {lineTypes.map(lt => {
                                const allIds = filteredDefectCodes.map(d => String(d.id));
                                const current = matrix[String(lt.id)] || new Set();
                                const allSelected = allIds.length > 0 && allIds.every(id => current.has(id));
                                const someSelected = !allSelected && allIds.some(id => current.has(id));
                                return (
                                    <td key={lt.id} className="px-3 py-2 text-center border-r border-slate-700 last:border-r-0">
                                        <button
                                            onClick={() => toggleAllForLineType(lt.id, filteredDefectCodes)}
                                            className={`w-5 h-5 rounded border-2 mx-auto flex items-center justify-center transition-colors ${
                                                allSelected
                                                    ? 'bg-indigo-500 border-indigo-400'
                                                    : someSelected
                                                    ? 'bg-indigo-900 border-indigo-500'
                                                    : 'bg-slate-700 border-slate-500 hover:border-indigo-400'
                                            }`}
                                        >
                                            {(allSelected || someSelected) && (
                                                <Check size={12} className={allSelected ? 'text-white' : 'text-indigo-400'} strokeWidth={3} />
                                            )}
                                        </button>
                                    </td>
                                );
                            })}
                        </tr>
                    </thead>

                    <tbody className="divide-y divide-slate-100">
                        {filteredDefectCodes.length === 0 ? (
                            <tr>
                                <td colSpan={lineTypes.length + 1} className="text-center py-10 text-slate-400 italic">
                                    No defect codes match "{search}".
                                </td>
                            </tr>
                        ) : (
                            filteredDefectCodes.map((dc, idx) => (
                                <tr
                                    key={dc.id}
                                    className={`transition-colors hover:bg-indigo-50 ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}
                                >
                                    {/* Label */}
                                    <td className="sticky left-0 z-10 px-4 py-3 border-r border-slate-200 bg-inherit">
                                        <span className="font-bold text-slate-800">{dc.code}</span>
                                        {dc.description && (
                                            <span className="block text-xs text-slate-400 mt-0.5 truncate max-w-[180px]" title={dc.description}>
                                                {dc.description}
                                            </span>
                                        )}
                                    </td>
                                    {/* Checkboxes */}
                                    {lineTypes.map(lt => {
                                        const checked = !!(matrix[String(lt.id)]?.has(String(dc.id)));
                                        return (
                                            <td key={lt.id} className="px-3 py-3 text-center border-r border-slate-100 last:border-r-0">
                                                <button
                                                    onClick={() => toggle(lt.id, dc.id)}
                                                    className={`w-5 h-5 rounded border-2 mx-auto flex items-center justify-center transition-all active:scale-90 ${
                                                        checked
                                                            ? 'bg-indigo-600 border-indigo-500 shadow-sm'
                                                            : 'bg-white border-slate-300 hover:border-indigo-400'
                                                    }`}
                                                >
                                                    {checked && <Check size={12} className="text-white" strokeWidth={3} />}
                                                </button>
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {dirty.size > 0 && (
                <div className="mt-4 flex justify-end">
                    <button
                        onClick={saveAll}
                        className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-bold shadow-sm transition-colors"
                    >
                        <Save size={15} /> Save All Changes ({dirty.size} columns)
                    </button>
                </div>
            )}

            {/* Add Defect Code Modal */}
            {showAddModal && (
                <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[500]">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
                        <div className="flex items-center justify-between mb-5">
                            <h2 className="text-lg font-bold text-slate-900">New Defect Code</h2>
                            <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600">
                                <X size={20} />
                            </button>
                        </div>
                        <form onSubmit={handleAddDefectCode} className="flex flex-col gap-4">
                            {/* Category */}
                            <div>
                                <label className="block text-xs font-bold text-slate-600 mb-1 uppercase tracking-wide">Category <span className="text-red-500">*</span></label>
                                <select
                                    value={newCategory}
                                    onChange={e => handleCategoryChange(e.target.value)}
                                    required
                                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                                >
                                    <option value="">Select category…</option>
                                    {categories.map(cat => (
                                        <option key={cat} value={cat}>{cat}</option>
                                    ))}
                                    <option value="NEW">+ New category…</option>
                                </select>
                            </div>

                            {/* New category name input */}
                            {newCategory === 'NEW' && (
                                <div>
                                    <label className="block text-xs font-bold text-slate-600 mb-1 uppercase tracking-wide">New Category Name <span className="text-red-500">*</span></label>
                                    <input
                                        type="text"
                                        value={newCategoryName}
                                        onChange={e => handleNewCategoryNameChange(e.target.value)}
                                        placeholder="e.g. EMBROIDERY"
                                        required
                                        autoFocus
                                        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                                    />
                                </div>
                            )}

                            {/* Code — pre-filled with suggestion, editable */}
                            <div>
                                <label className="block text-xs font-bold text-slate-600 mb-1 uppercase tracking-wide">
                                    Code <span className="text-red-500">*</span>
                                    {newCode && <span className="ml-2 text-indigo-400 font-normal normal-case tracking-normal">auto-suggested</span>}
                                </label>
                                <input
                                    type="text"
                                    value={newCode}
                                    onChange={e => setNewCode(e.target.value)}
                                    placeholder="e.g. SEW-008"
                                    required
                                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none font-mono"
                                />
                            </div>

                            {/* Description */}
                            <div>
                                <label className="block text-xs font-bold text-slate-600 mb-1 uppercase tracking-wide">Description</label>
                                <input
                                    type="text"
                                    value={newDescription}
                                    onChange={e => setNewDescription(e.target.value)}
                                    placeholder="Short description"
                                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                                />
                            </div>

                            {addError && (
                                <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                                    <AlertCircle size={15} /> {addError}
                                </div>
                            )}
                            <div className="flex justify-end gap-3 pt-1">
                                <button
                                    type="button"
                                    onClick={() => setShowAddModal(false)}
                                    className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900 border border-slate-300 rounded-lg transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={addSaving || !newCode.trim() || !newCategory || (newCategory === 'NEW' && !newCategoryName.trim())}
                                    className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-sm font-bold transition-colors"
                                >
                                    {addSaving ? <Loader2 className="animate-spin h-4 w-4" /> : <Plus size={15} />}
                                    {addSaving ? 'Saving...' : 'Add Defect Code'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DefectCodeLineTypePage;

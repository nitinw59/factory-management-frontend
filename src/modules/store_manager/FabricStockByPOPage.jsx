import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { storeManagerApi } from '../../api/storeManagerApi';
import { accountingApi } from '../../api/accountingApi';
import {
    Loader2, Search, X, ChevronDown, ChevronRight,
    Package, Layers, Truck, AlertCircle, Palette, RefreshCw, FileDown
} from 'lucide-react';

const statusBadge = (status) => {
    if (status === 'IN_STOCK') return <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-green-100 text-green-700">Stock</span>;
    if (status === 'IN_PRODUCTION') return <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-700">Prod</span>;
    return <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-gray-100 text-gray-500">{status}</span>;
};

const RollsTable = ({ rolls }) => (
    <div className="overflow-x-auto">
        <table className="w-full text-xs text-left">
            <thead className="bg-white text-gray-400 border-b border-gray-100">
                <tr>
                    <th className="px-4 py-2 font-medium w-20">Roll ID</th>
                    <th className="px-4 py-2 font-medium">Fabric Type</th>
                    <th className="px-4 py-2 font-medium">Color</th>
                    <th className="px-4 py-2 font-medium">Reference</th>
                    <th className="px-4 py-2 font-medium text-right w-24">Qty</th>
                    <th className="px-4 py-2 font-medium text-center w-16">Status</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
                {rolls.map(roll => (
                    <tr key={roll.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-2 font-mono text-indigo-600">R-{roll.id}</td>
                        <td className="px-4 py-2 text-gray-700">{roll.fabric_type}</td>
                        <td className="px-4 py-2 text-gray-700">
                            <span className="font-medium">{roll.color_number}</span>
                            {roll.fabric_color && <span className="ml-1 text-gray-400">({roll.fabric_color})</span>}
                        </td>
                        <td className="px-4 py-2 text-gray-500 font-mono">{roll.reference_number || '—'}</td>
                        <td className="px-4 py-2 text-right font-bold text-gray-800">
                            {roll.meter} <span className="font-normal text-gray-400">{roll.uom || 'm'}</span>
                        </td>
                        <td className="px-4 py-2 text-center">{statusBadge(roll.status)}</td>
                    </tr>
                ))}
            </tbody>
        </table>
    </div>
);

// --- Per-PO lazy-loaded panel (used in normal PO view) ---
const POExpandedRolls = ({ poId, rollsCache, onRollsLoaded }) => {
    const [loading, setLoading] = useState(!rollsCache[poId]);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (rollsCache[poId]) return; // already cached
        storeManagerApi.getFabricRollsByPO(poId)
            .then(res => onRollsLoaded(poId, res.data || []))
            .catch(() => setError('Failed to load rolls.'))
            .finally(() => setLoading(false));
    }, [poId]);

    if (loading) return <div className="flex items-center gap-2 p-4 text-sm text-gray-400"><Loader2 className="animate-spin h-4 w-4" /> Loading rolls...</div>;
    if (error) return <div className="p-4 text-sm text-red-500 flex items-center gap-2"><AlertCircle size={14} />{error}</div>;

    const rolls = rollsCache[poId] || [];
    if (rolls.length === 0) return <div className="p-4 text-sm text-gray-400 italic">No rolls received for this PO.</div>;

    const inStock = rolls.filter(r => r.status === 'IN_STOCK').length;
    const totalMeters = rolls.reduce((s, r) => s + parseFloat(r.meter || 0), 0);

    return (
        <div className="border-t border-gray-100">
            <div className="flex items-center gap-6 px-4 py-2 bg-gray-50 text-xs text-gray-500 border-b border-gray-100">
                <span><span className="font-bold text-gray-700">{rolls.length}</span> rolls</span>
                <span><span className="font-bold text-green-700">{inStock}</span> in stock</span>
                <span>Total: <span className="font-bold text-gray-700">{totalMeters.toFixed(2)}</span> m</span>
            </div>
            <RollsTable rolls={rolls} />
        </div>
    );
};

// --- PO Row Card (normal view) ---
const POCard = ({ po, rollsCache, onRollsLoaded, isOpen, onToggle }) => (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden transition-shadow hover:shadow-md">
        <div
            onClick={onToggle}
            className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-4 cursor-pointer select-none hover:bg-slate-50 transition-colors"
        >
            <div className="flex items-start gap-3">
                <div className="p-2 bg-amber-50 text-amber-600 rounded-lg mt-0.5 shrink-0">
                    <Truck size={18} />
                </div>
                <div>
                    <p className="font-bold text-slate-800 text-sm">{po.po_code || po.po_number || `PO-${po.id}`}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{po.supplier_name || 'Unknown Supplier'}</p>
                    {po.material_summary && <p className="text-xs text-slate-400 mt-0.5 max-w-md truncate">{po.material_summary}</p>}
                </div>
            </div>
            <div className="flex items-center gap-3 md:shrink-0">
                <span className={`px-2 py-0.5 text-[10px] font-bold rounded border uppercase ${
                    po.status === 'RECEIVED' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-amber-50 text-amber-700 border-amber-200'
                }`}>{po.status}</span>
                <div className={`p-2 rounded-lg transition-colors ${isOpen ? 'bg-indigo-100 text-indigo-600' : 'bg-gray-100 text-gray-400'}`}>
                    {isOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                </div>
            </div>
        </div>
        {isOpen && <POExpandedRolls poId={po.id} rollsCache={rollsCache} onRollsLoaded={onRollsLoaded} />}
    </div>
);

// --- Main Page ---
const FabricStockByPOPage = () => {
    const [poList, setPoList] = useState([]);
    const [loadingPOs, setLoadingPOs] = useState(true);
    const [error, setError] = useState(null);

    // rolls cache: { [poId]: roll[] }
    const [rollsCache, setRollsCache] = useState({});
    const [loadingAllRolls, setLoadingAllRolls] = useState(false);
    const allRollsFetched = useRef(false);

    // UI state
    const [poSearch, setPoSearch] = useState('');          // filters PO list
    const [colorSearch, setColorSearch] = useState('');    // cross-PO color search
    const [viewByColor, setViewByColor] = useState(false); // toggle: group by color
    const [openPoId, setOpenPoId] = useState(null);

    // --- Load PO list ---
    const fetchPOs = useCallback(async () => {
        setLoadingPOs(true);
        setError(null);
        try {
            const res = await accountingApi.getPurchaseOrders();
            setPoList(res.data || []);
        } catch {
            setError('Failed to load purchase orders.');
        } finally {
            setLoadingPOs(false);
        }
    }, []);

    useEffect(() => { fetchPOs(); }, [fetchPOs]);

    // --- Fetch ALL rolls (runs when color search or by-color view is needed) ---
    const fetchAllRolls = useCallback(async (pos) => {
        if (allRollsFetched.current || loadingAllRolls) return;
        setLoadingAllRolls(true);
        try {
            const results = await Promise.allSettled(
                pos.map(po => storeManagerApi.getFabricRollsByPO(po.id).then(r => ({ poId: po.id, rolls: r.data || [] })))
            );
            const newCache = {};
            results.forEach(r => {
                if (r.status === 'fulfilled') newCache[r.value.poId] = r.value.rolls;
            });
            setRollsCache(prev => ({ ...prev, ...newCache }));
            allRollsFetched.current = true;
        } finally {
            setLoadingAllRolls(false);
        }
    }, [loadingAllRolls]);

    // Trigger full fetch when color search is used or by-color toggled
    useEffect(() => {
        if ((colorSearch || viewByColor) && poList.length > 0 && !allRollsFetched.current) {
            fetchAllRolls(poList);
        }
    }, [colorSearch, viewByColor, poList]);

    const onRollsLoaded = useCallback((poId, rolls) => {
        setRollsCache(prev => ({ ...prev, [poId]: rolls }));
    }, []);

    // --- All rolls flat list (from cache) ---
    const allRolls = useMemo(() => Object.values(rollsCache).flat(), [rollsCache]);

    // --- COLOR SEARCH RESULTS: rolls matching color, grouped by PO ---
    const colorSearchResults = useMemo(() => {
        if (!colorSearch) return null;
        const lower = colorSearch.toLowerCase();
        const matched = allRolls.filter(r =>
            r.color_number?.toLowerCase().includes(lower) ||
            r.fabric_color?.toLowerCase().includes(lower)
        );
        // group by PO
        const byPO = {};
        matched.forEach(r => {
            const key = r.po_id ?? 'unknown';
            if (!byPO[key]) byPO[key] = { po_id: r.po_id, po_code: r.po_code, rolls: [] };
            byPO[key].rolls.push(r);
        });
        return Object.values(byPO);
    }, [colorSearch, allRolls]);

    // --- BY-COLOR VIEW: in-stock rolls grouped by color_number ---
    const byColorGroups = useMemo(() => {
        if (!viewByColor) return null;
        const inStock = allRolls.filter(r => r.status === 'IN_STOCK');
        const groups = {};
        inStock.forEach(r => {
            const key = r.color_number || 'Unknown';
            if (!groups[key]) groups[key] = { color_number: key, fabric_color: r.fabric_color, rolls: [] };
            groups[key].rolls.push(r);
        });
        return Object.values(groups).sort((a, b) => a.color_number.localeCompare(b.color_number));
    }, [viewByColor, allRolls]);

    // --- PO LIST filtered by poSearch ---
    const filteredPOs = useMemo(() => {
        if (!poSearch) return poList;
        const lower = poSearch.toLowerCase();
        return poList.filter(po =>
            po.po_code?.toLowerCase().includes(lower) ||
            po.po_number?.toLowerCase().includes(lower) ||
            po.supplier_name?.toLowerCase().includes(lower) ||
            po.status?.toLowerCase().includes(lower)
        );
    }, [poList, poSearch]);

    const isColorMode = !!colorSearch;
    const isColorView = viewByColor && !colorSearch;

    // --- Export current view to CSV (opens as Excel) ---
    const exportToCSV = useCallback(() => {
        let rows = [];

        if (isColorMode && colorSearchResults) {
            rows = colorSearchResults.flatMap(g =>
                g.rolls.map(r => ({ PO: g.po_code || `PO-${g.po_id}`, ...r }))
            );
        } else if (isColorView && byColorGroups) {
            rows = byColorGroups.flatMap(g => g.rolls);
        } else {
            rows = Object.entries(rollsCache).flatMap(([poId, rolls]) => {
                const po = poList.find(p => String(p.id) === String(poId));
                return rolls.map(r => ({ PO: po?.po_code || po?.po_number || `PO-${poId}`, Supplier: po?.supplier_name || '', ...r }));
            });
        }

        if (rows.length === 0) { alert('No data to export. Expand some POs first or use a color search.'); return; }

        const headers = ['PO', 'Supplier', 'Roll ID', 'Fabric Type', 'Color Number', 'Color Name', 'Quantity', 'UOM', 'Reference', 'Status'];
        const csvRows = [
            headers.join(','),
            ...rows.map(r => [
                r.PO || '',
                r.Supplier || '',
                `R-${r.id}`,
                r.fabric_type || '',
                r.color_number || '',
                r.fabric_color || '',
                r.meter || '',
                r.uom || 'm',
                r.reference_number || '',
                r.status || '',
            ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
        ];

        const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `fabric-stock-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }, [isColorMode, isColorView, colorSearchResults, byColorGroups, rollsCache, poList]);

    return (
        <div className="p-6 bg-slate-50 min-h-screen font-inter text-slate-800">
            {/* Header */}
            <header className="mb-6">
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-5">
                    <div>
                        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-3">
                            <Package className="text-indigo-500" size={28} />
                            Fabric Stock by PO
                        </h1>
                        <p className="text-slate-500 mt-1">View fabric rolls received, grouped by Purchase Order.</p>
                    </div>
                    {!loadingPOs && !error && (
                        <div className="flex items-center gap-3 shrink-0">
                            <div className="bg-white border border-slate-200 rounded-lg px-4 py-2 text-center shadow-sm">
                                <p className="text-xs text-slate-400 font-medium uppercase">Purchase Orders</p>
                                <p className="text-xl font-extrabold text-slate-800">{poList.length}</p>
                            </div>
                            <button
                                onClick={exportToCSV}
                                className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-semibold shadow-sm transition-colors"
                            >
                                <FileDown size={16} /> Export to Excel
                            </button>
                        </div>
                    )}
                </div>

                {/* Search + Toggle bar */}
                <div className="flex flex-col md:flex-row gap-3">
                    {/* PO search — hidden when color search is active */}
                    {!isColorMode && !isColorView && (
                        <div className="relative flex-1 max-w-xs">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={15} />
                            <input
                                type="text"
                                placeholder="Search PO, supplier..."
                                value={poSearch}
                                onChange={e => setPoSearch(e.target.value)}
                                className="w-full pl-9 pr-8 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white shadow-sm text-sm"
                            />
                            {poSearch && <button onClick={() => setPoSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><X size={14} /></button>}
                        </div>
                    )}

                    {/* Color search — cross PO */}
                    <div className="relative flex-1 max-w-sm">
                        <Palette className="absolute left-3 top-1/2 -translate-y-1/2 text-indigo-400" size={15} />
                        <input
                            type="text"
                            placeholder="Search by color number or name across all POs..."
                            value={colorSearch}
                            onChange={e => { setColorSearch(e.target.value); if (viewByColor) setViewByColor(false); }}
                            className="w-full pl-9 pr-8 py-2.5 border border-indigo-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white shadow-sm text-sm"
                        />
                        {colorSearch && <button onClick={() => setColorSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><X size={14} /></button>}
                    </div>

                    {/* By-color toggle */}
                    <button
                        onClick={() => { setViewByColor(v => !v); setColorSearch(''); setPoSearch(''); }}
                        className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-semibold transition-colors shrink-0 shadow-sm ${
                            viewByColor
                                ? 'bg-indigo-600 text-white border-indigo-600'
                                : 'bg-white text-slate-600 border-slate-300 hover:border-indigo-400 hover:text-indigo-600'
                        }`}
                    >
                        <Layers size={15} />
                        View by Color
                    </button>
                </div>

                {/* Loading all rolls indicator */}
                {loadingAllRolls && (
                    <div className="mt-3 flex items-center gap-2 text-xs text-indigo-500">
                        <RefreshCw className="animate-spin h-3 w-3" /> Fetching rolls across all POs...
                    </div>
                )}
            </header>

            {/* Content */}
            {loadingPOs ? (
                <div className="flex justify-center p-16"><Loader2 className="animate-spin h-10 w-10 text-indigo-500" /></div>
            ) : error ? (
                <div className="flex items-center gap-3 p-5 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
                    <AlertCircle size={18} className="shrink-0" /> {error}
                </div>

            ) : isColorMode ? (
                /* ── COLOR SEARCH RESULTS ── */
                <div className="space-y-3">
                    {loadingAllRolls ? (
                        <div className="flex justify-center p-12"><Loader2 className="animate-spin h-8 w-8 text-indigo-400" /></div>
                    ) : !colorSearchResults || colorSearchResults.length === 0 ? (
                        <div className="text-center py-16 bg-white rounded-xl border border-dashed border-slate-200">
                            <Palette className="mx-auto text-slate-300 mb-3" size={36} />
                            <p className="text-slate-400 font-medium">No rolls found for color "{colorSearch}"</p>
                        </div>
                    ) : (
                        <>
                            <p className="text-xs text-slate-400">
                                Found <span className="font-bold text-slate-600">{colorSearchResults.reduce((s, g) => s + g.rolls.length, 0)}</span> rolls matching "{colorSearch}" across <span className="font-bold text-slate-600">{colorSearchResults.length}</span> POs
                            </p>
                            {colorSearchResults.map(group => (
                                <div key={group.po_id ?? 'unknown'} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                                    <div className="flex items-center gap-3 px-4 py-3 bg-indigo-50 border-b border-indigo-100">
                                        <Truck size={15} className="text-indigo-500 shrink-0" />
                                        <span className="font-bold text-indigo-800 text-sm">{group.po_code || `PO-${group.po_id}`}</span>
                                        <span className="text-xs text-indigo-400">{group.rolls.length} roll{group.rolls.length !== 1 ? 's' : ''}</span>
                                    </div>
                                    <RollsTable rolls={group.rolls} />
                                </div>
                            ))}
                        </>
                    )}
                </div>

            ) : isColorView ? (
                /* ── BY-COLOR VIEW ── */
                <div className="space-y-3">
                    {loadingAllRolls ? (
                        <div className="flex justify-center p-12"><Loader2 className="animate-spin h-8 w-8 text-indigo-400" /></div>
                    ) : !byColorGroups || byColorGroups.length === 0 ? (
                        <div className="text-center py-16 bg-white rounded-xl border border-dashed border-slate-200">
                            <Layers className="mx-auto text-slate-300 mb-3" size={36} />
                            <p className="text-slate-400 font-medium">No in-stock rolls found.</p>
                        </div>
                    ) : (
                        <>
                            <p className="text-xs text-slate-400 mb-1">
                                <span className="font-bold text-slate-600">{byColorGroups.length}</span> colors · <span className="font-bold text-slate-600">{byColorGroups.reduce((s, g) => s + g.rolls.length, 0)}</span> rolls in stock
                            </p>
                            {byColorGroups.map(group => {
                                const totalM = group.rolls.reduce((s, r) => s + parseFloat(r.meter || 0), 0);
                                return (
                                    <div key={group.color_number} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                                        <div className="flex items-center justify-between px-4 py-3 bg-emerald-50 border-b border-emerald-100">
                                            <div className="flex items-center gap-2">
                                                <Palette size={15} className="text-emerald-600 shrink-0" />
                                                <span className="font-bold text-emerald-800 text-sm">{group.color_number}</span>
                                                {group.fabric_color && <span className="text-xs text-emerald-500">({group.fabric_color})</span>}
                                                <span className="text-xs text-emerald-400">{group.rolls.length} roll{group.rolls.length !== 1 ? 's' : ''}</span>
                                            </div>
                                            <span className="text-xs font-bold text-emerald-700">{totalM.toFixed(2)} m total</span>
                                        </div>
                                        <RollsTable rolls={group.rolls} />
                                    </div>
                                );
                            })}
                        </>
                    )}
                </div>

            ) : (
                /* ── NORMAL PO ACCORDION VIEW ── */
                filteredPOs.length === 0 ? (
                    <div className="text-center py-20 bg-white rounded-xl border border-dashed border-slate-200">
                        <Layers className="mx-auto text-slate-300 mb-3" size={40} />
                        <p className="text-slate-400 font-medium">
                            {poSearch ? `No POs match "${poSearch}"` : 'No purchase orders found.'}
                        </p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {poSearch && <p className="text-xs text-slate-400">Showing {filteredPOs.length} of {poList.length} POs</p>}
                        {filteredPOs.map(po => (
                            <POCard
                                key={po.id}
                                po={po}
                                rollsCache={rollsCache}
                                onRollsLoaded={onRollsLoaded}
                                isOpen={openPoId === po.id}
                                onToggle={() => setOpenPoId(prev => prev === po.id ? null : po.id)}
                            />
                        ))}
                    </div>
                )
            )}
        </div>
    );
};

export default FabricStockByPOPage;

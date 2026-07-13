import { useState, useEffect, useCallback, useMemo } from 'react';
import { CheckCircle2, Loader2, AlertTriangle, Plus, ArrowLeft, X, Search, History } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { purchaseDeptApi } from '../../api/purchaseDeptApi';
import { storeManagerApi } from '../../api/storeManagerApi';
import { trimsApi } from '../../api/trimsApi';
import { sparesApi } from '../../api/sparesApi';
import { generalItemsApi } from '../../api/generalItemsApi';
import SearchableSelect from '../../shared/SearchableSelect';

const TYPES = [
    { key: 'fabric', label: 'Fabric',     cls: 'bg-violet-100 text-violet-700 border-violet-200' },
    { key: 'trim',   label: 'Trim',       cls: 'bg-amber-100 text-amber-700 border-amber-200' },
    { key: 'spare',  label: 'Spare Part', cls: 'bg-blue-100 text-blue-700 border-blue-200' },
    { key: 'other',  label: 'Other',      cls: 'bg-slate-100 text-slate-700 border-slate-200' },
];

const COMMON_UOMS = ['pcs', 'm', 'yd', 'kg', 'g', 'dozen', 'gross', 'roll', 'cone', 'box', 'pkt', 'pair', 'set', 'liter'];

const UomSelect = ({ value, onChange }) => (
    <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:border-orange-400"
    >
        <option value="">— Unit —</option>
        {/* keep a previously entered free-text value selectable */}
        {value && !COMMON_UOMS.includes(value) && <option value={value}>{value}</option>}
        {COMMON_UOMS.map(u => <option key={u} value={u}>{u}</option>)}
    </select>
);

const URGENCIES = [
    { key: 'LOW',    label: 'Low',    cls: 'bg-slate-100 text-slate-600 border-slate-200' },
    { key: 'NORMAL', label: 'Normal', cls: 'bg-blue-100 text-blue-700 border-blue-200' },
    { key: 'HIGH',   label: 'High',   cls: 'bg-orange-100 text-orange-700 border-orange-200' },
    { key: 'URGENT', label: 'Urgent', cls: 'bg-red-100 text-red-700 border-red-200' },
];

// ─── Requirement history (below the form) ────────────────────────────────────

const HISTORY_STATUSES = ['PENDING', 'PO_RAISED', 'FULFILLED', 'CANCELLED'];

const HISTORY_STATUS_CFG = {
    PENDING:   { cls: 'bg-amber-100 text-amber-700 border-amber-200',         label: 'Pending'   },
    PO_RAISED: { cls: 'bg-blue-100 text-blue-700 border-blue-200',             label: 'PO Raised' },
    FULFILLED: { cls: 'bg-emerald-100 text-emerald-700 border-emerald-200',    label: 'Fulfilled' },
    CANCELLED: { cls: 'bg-slate-100 text-slate-500 border-slate-200',          label: 'Cancelled' },
};

// Same labeling rules as RequirementsPage's reqTitle
const reqTitle = (req) => {
    if (req.type === 'fabric') {
        const colorBit = req.fabric_color_name
            ? `${req.fabric_color_name}${req.fabric_color_number ? ` · ${req.fabric_color_number}` : ''}`
            : null;
        const parts = [req.fabric_type_name, colorBit].filter(Boolean);
        return parts.length ? parts.join(' · ') : 'Fabric requirement';
    }
    if (req.type === 'trim') {
        const base = req.trim_item_name || 'Trim requirement';
        return req.variant_size ? `${base} · Sz ${req.variant_size}` : base;
    }
    if (req.type === 'spare') {
        return req.spare_part_name
            ? `${req.spare_part_name}${req.spare_part_number ? ` (${req.spare_part_number})` : ''}`
            : 'Spare part requirement';
    }
    if (req.type === 'other') {
        return req.general_item_name
            ? `${req.general_item_name}${req.general_item_code ? ` (${req.general_item_code})` : ''}`
            : (req.description || 'Other requirement');
    }
    return 'Requirement';
};

const reqQty = (req) => req.type === 'fabric'
    ? `${Number(req.meters_required || 0).toLocaleString('en-IN', { maximumFractionDigits: 1 })} m`
    : `${Number(req.quantity_required || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })} ${req.unit_of_measure || req.trim_uom || req.general_item_uom || 'pcs'}`;

function RequirementHistory() {
    const [rows,         setRows]         = useState([]);
    const [loading,      setLoading]      = useState(true);
    const [q,            setQ]            = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [limit,        setLimit]        = useState(25);

    useEffect(() => {
        let cancelled = false;
        // The endpoint is status-scoped — fetch all four in parallel and merge
        // (same pattern as RequirementsPage's tab counts).
        Promise.all(HISTORY_STATUSES.map(s =>
            purchaseDeptApi.getRequirements({ status: s })
                .then(r => r.data?.data ?? r.data ?? [])
                .catch(() => [])
        )).then(arrs => {
            if (cancelled) return;
            const merged = arrs.flat().filter(r => r?.id != null);
            merged.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
            setRows(merged);
        }).finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, []);

    const filtered = useMemo(() => {
        const s = q.trim().toLowerCase();
        return rows.filter(r => {
            if (statusFilter && r.status !== statusFilter) return false;
            if (!s) return true;
            const hay = [
                reqTitle(r), r.type, r.order_number, r.customer_name, r.po_code,
                r.raised_by_name, r.notes, r.description,
            ].filter(Boolean).join(' ').toLowerCase();
            return hay.includes(s);
        });
    }, [rows, q, statusFilter]);

    const visible = filtered.slice(0, limit);

    return (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
            <div className="flex items-center gap-2">
                <History size={15} className="text-slate-400" />
                <h2 className="text-sm font-bold text-slate-800">Previously Raised</h2>
                {!loading && <span className="text-[11px] text-slate-400">({filtered.length})</span>}
            </div>

            <div className="flex flex-wrap items-center gap-2">
                <div className="relative flex-1 min-w-[180px]">
                    <Search size={13} className="absolute left-3 top-2.5 text-slate-400" />
                    <input
                        type="text" value={q} onChange={e => { setQ(e.target.value); setLimit(25); }}
                        placeholder="Search item, SO, PO, customer, raised by…"
                        className="w-full text-sm pl-8 pr-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:border-orange-400"
                    />
                </div>
                <select
                    value={statusFilter}
                    onChange={e => { setStatusFilter(e.target.value); setLimit(25); }}
                    className="text-sm border border-slate-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:border-orange-400"
                >
                    <option value="">All statuses</option>
                    {HISTORY_STATUSES.map(s => <option key={s} value={s}>{HISTORY_STATUS_CFG[s].label}</option>)}
                </select>
            </div>

            {loading ? (
                <div className="flex justify-center py-8"><Loader2 className="animate-spin text-slate-400" size={22} /></div>
            ) : visible.length === 0 ? (
                <p className="text-center text-sm text-slate-400 italic py-8">
                    {rows.length === 0 ? 'No requirements raised yet.' : 'Nothing matches your search.'}
                </p>
            ) : (
                <div className="overflow-x-auto">
                    <table className="min-w-full text-left text-sm">
                        <thead>
                            <tr className="border-b border-slate-100">
                                <th className="pb-2 pr-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Item</th>
                                <th className="pb-2 pr-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-right">Qty</th>
                                <th className="pb-2 pr-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap">Date</th>
                                <th className="pb-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {visible.map(r => {
                                const tCfg = TYPES.find(t => t.key === r.type);
                                const sCfg = HISTORY_STATUS_CFG[r.status] || { cls: 'bg-slate-100 text-slate-500 border-slate-200', label: r.status || '—' };
                                const source = r.is_standalone
                                    ? 'Standalone'
                                    : [r.order_number, r.customer_name].filter(Boolean).join(' · ');
                                return (
                                    <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                                        <td className="py-2.5 pr-4">
                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                {tCfg && (
                                                    <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${tCfg.cls}`}>
                                                        {tCfg.label}
                                                    </span>
                                                )}
                                                <span className="text-xs font-semibold text-slate-800">{reqTitle(r)}</span>
                                            </div>
                                            <p className="text-[10px] text-slate-400 mt-0.5">
                                                {source}
                                                {r.po_code ? `${source ? ' · ' : ''}${r.po_code}` : ''}
                                                {r.raised_by_name ? ` · by ${r.raised_by_name}` : ''}
                                            </p>
                                        </td>
                                        <td className="py-2.5 pr-4 text-right text-xs font-bold text-slate-700 tabular-nums whitespace-nowrap">
                                            {reqQty(r)}
                                        </td>
                                        <td className="py-2.5 pr-4 text-xs text-slate-500 whitespace-nowrap">
                                            {r.created_at ? new Date(r.created_at).toLocaleDateString('en', { dateStyle: 'medium' }) : '—'}
                                        </td>
                                        <td className="py-2.5">
                                            <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${sCfg.cls}`}>
                                                {sCfg.label}
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                    {filtered.length > limit && (
                        <div className="text-center pt-3">
                            <button
                                onClick={() => setLimit(l => l + 25)}
                                className="text-xs font-semibold text-orange-500 hover:text-orange-600"
                            >
                                Show more ({filtered.length - limit} remaining)
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

const RaiseRequirementPage = () => {
    const navigate = useNavigate();

    const [fabricTypes,   setFabricTypes]   = useState([]);
    const [fabricColors,  setFabricColors]  = useState([]);
    const [trimItems,     setTrimItems]     = useState([]);
    const [trimVariants,  setTrimVariants]  = useState([]);
    const [spareParts,    setSpareParts]    = useState([]);
    const [loadingVars,   setLoadingVars]   = useState(false);

    const [type,          setType]          = useState('fabric');
    const [fabricTypeId,  setFabricTypeId]  = useState('');
    const [fabricColorId, setFabricColorId] = useState('');
    const [metersRequired, setMeters]       = useState('');
    const [trimItemId,    setTrimItemId]    = useState('');
    const [trimVariantId, setTrimVariantId] = useState('');
    const [spareId,         setSpareId]         = useState('');
    const [generalItemId,   setGeneralItemId]   = useState('');
    const [generalItems,    setGeneralItems]    = useState([]);
    const [quantity,        setQuantity]        = useState('');
    const [uom,             setUom]             = useState('');
    const [description,     setDescription]     = useState(''); // notes only

    // Quick-create general item
    const [showQuickCreate,    setShowQuickCreate]    = useState(false);
    const [quickCreateName,    setQuickCreateName]    = useState('');
    const [quickCreateCode,    setQuickCreateCode]    = useState('');
    const [quickCreateBusy,    setQuickCreateBusy]    = useState(false);
    const [quickCreateErr,     setQuickCreateErr]     = useState(null);
    const [urgency,       setUrgency]       = useState('NORMAL');
    const [notes,         setNotes]         = useState('');
    const [unitPrice,     setUnitPrice]     = useState('');

    const [busy,    setBusy]    = useState(false);
    const [err,     setErr]     = useState(null);
    const [success, setSuccess] = useState(false);
    const [showForm, setShowForm] = useState(false); // history-first: form opens via "New Request"

    useEffect(() => {
        storeManagerApi.getFabricTypes()
            .then(r => setFabricTypes(r.data?.data ?? r.data ?? []))
            .catch(() => {});
        storeManagerApi.getFabricColors()
            .then(r => setFabricColors(r.data?.data ?? r.data ?? []))
            .catch(() => {});
        trimsApi.getItems()
            .then(r => setTrimItems(r.data?.data ?? r.data ?? []))
            .catch(() => {});
        sparesApi.getAllSpares()
            .then(data => setSpareParts(Array.isArray(data) ? data : (data?.data || [])))
            .catch(() => {});
        generalItemsApi.getItems({ active: true })
            .then(r => setGeneralItems(r.data?.data ?? r.data ?? []))
            .catch(() => {});
    }, []);

    useEffect(() => {
        setTrimVariantId('');
        setTrimVariants([]);
        if (!trimItemId) return;
        setLoadingVars(true);
        storeManagerApi.getVariantsByTrimItem(trimItemId)
            .then(r => setTrimVariants(r.data?.data ?? r.data ?? []))
            .catch(() => {})
            .finally(() => setLoadingVars(false));
    }, [trimItemId]);

    const handleQuickCreate = useCallback(async () => {
        if (!quickCreateName.trim()) { setQuickCreateErr('Name is required.'); return; }
        setQuickCreateBusy(true); setQuickCreateErr(null);
        try {
            const r = await generalItemsApi.createItem({
                name: quickCreateName.trim(),
                ...(quickCreateCode.trim() ? { item_code: quickCreateCode.trim() } : {}),
            });
            const newItem = r.data?.data ?? r.data;
            setGeneralItems(prev => [...prev, newItem]);
            setGeneralItemId(String(newItem.id));
            setShowQuickCreate(false);
        } catch (e) {
            setQuickCreateErr(e?.response?.data?.error || 'Failed to create item.');
        } finally {
            setQuickCreateBusy(false);
        }
    }, [quickCreateName, quickCreateCode]);

    const resetForm = () => {
        setFabricTypeId(''); setFabricColorId(''); setMeters('');
        setTrimItemId(''); setTrimVariantId(''); setTrimVariants([]);
        setSpareId(''); setQuantity(''); setUom(''); setDescription('');
        setNotes(''); setUnitPrice(''); setErr(null); setSuccess(false);
    };

    const handleTypeChange = (t) => { setType(t); setErr(null); };

    const handleSubmit = async () => {
        setErr(null);
        const body = { type, urgency };
        if (notes.trim())      body.notes      = notes.trim();
        if (unitPrice !== '')  body.unit_price  = parseFloat(unitPrice) || 0;

        if (type === 'fabric') {
            if (!fabricTypeId) { setErr('Please select a fabric type.'); return; }
            if (!metersRequired || parseFloat(metersRequired) <= 0) { setErr('Enter meters required.'); return; }
            body.fabric_type_id  = parseInt(fabricTypeId);
            body.meters_required = parseFloat(metersRequired);
            if (fabricColorId) body.fabric_color_id = parseInt(fabricColorId);
        } else if (type === 'trim') {
            if (!trimVariantId) { setErr('Please select a trim variant.'); return; }
            if (!quantity || parseFloat(quantity) <= 0) { setErr('Enter quantity required.'); return; }
            body.trim_item_variant_id = parseInt(trimVariantId);
            body.quantity_required    = parseFloat(quantity);
            if (uom.trim()) body.unit_of_measure = uom.trim();
        } else if (type === 'spare') {
            if (!spareId) { setErr('Please select a spare part.'); return; }
            if (!quantity || parseFloat(quantity) <= 0) { setErr('Enter quantity required.'); return; }
            body.spare_part_id     = parseInt(spareId);
            body.quantity_required = parseFloat(quantity);
        } else {
            if (!generalItemId) { setErr('Please select an item.'); return; }
            if (!quantity || parseFloat(quantity) <= 0) { setErr('Enter quantity required.'); return; }
            body.general_item_id   = parseInt(generalItemId);
            body.quantity_required = parseFloat(quantity);
            if (uom.trim())         body.unit_of_measure = uom.trim();
            if (description.trim()) body.description     = description.trim();
        }

        setBusy(true);
        try {
            await purchaseDeptApi.raiseStandaloneRequirement(body);
            setSuccess(true);
        } catch (e) {
            setErr(e?.response?.data?.error || 'Failed to raise requirement.');
        } finally {
            setBusy(false);
        }
    };

    if (success) {
        return (
            <div className="flex items-center justify-center min-h-[60vh] p-6">
                <div className="max-w-sm w-full text-center bg-white rounded-2xl border border-slate-200 p-8 shadow-sm">
                    <CheckCircle2 size={44} className="mx-auto text-emerald-500 mb-4" />
                    <h2 className="text-lg font-bold text-slate-800 mb-1">Request Submitted</h2>
                    <p className="text-sm text-slate-500 mb-6">
                        The purchase team will review and raise a PO.
                    </p>
                    <div className="flex justify-center gap-3">
                        <button
                            onClick={() => { resetForm(); }}
                            className="text-sm font-medium text-slate-600 border border-slate-200 hover:bg-slate-50 px-4 py-2 rounded-xl transition-colors"
                        >
                            Raise Another
                        </button>
                        <button
                            onClick={() => navigate(-1)}
                            className="text-sm font-bold text-white bg-orange-500 hover:bg-orange-600 px-5 py-2 rounded-xl transition-colors"
                        >
                            Done
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <>
        <div className="p-4 sm:p-6 max-w-2xl mx-auto space-y-5">
            <div className="flex items-center gap-3">
                <button
                    onClick={() => navigate(-1)}
                    className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 transition-colors"
                >
                    <ArrowLeft size={18} />
                </button>
                <div>
                    <h1 className="text-xl font-bold text-slate-800">Purchase Requests</h1>
                    <p className="text-sm text-slate-500">Request material or items from the purchase team</p>
                </div>
                <button
                    onClick={() => setShowForm(v => !v)}
                    className={`ml-auto flex items-center gap-1.5 text-sm font-bold px-4 py-2 rounded-xl transition-colors ${
                        showForm
                            ? 'text-slate-600 border border-slate-200 hover:bg-slate-50'
                            : 'text-white bg-orange-500 hover:bg-orange-600'
                    }`}
                >
                    {showForm ? <><X size={14} /> Close</> : <><Plus size={14} /> New Request</>}
                </button>
            </div>

            {showForm && (
            <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-5">

                {/* Type selector */}
                <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Request Type *</p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {TYPES.map(t => (
                            <button
                                key={t.key}
                                onClick={() => handleTypeChange(t.key)}
                                className={`px-3 py-2.5 rounded-xl text-sm font-semibold border transition-all ${
                                    type === t.key
                                        ? `${t.cls} ring-2 ring-offset-1 ring-current shadow-sm`
                                        : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                                }`}
                            >
                                {t.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* ── FABRIC ── */}
                {type === 'fabric' && (
                    <>
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Fabric Type *</label>
                            <SearchableSelect
                                value={fabricTypeId}
                                onChange={setFabricTypeId}
                                options={fabricTypes.map(f => ({ value: f.id, label: f.name || f.type_name || `Type #${f.id}` }))}
                                placeholder="— Select fabric type —"
                            />
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                                Color <span className="text-slate-300 normal-case font-normal">(optional)</span>
                            </label>
                            <SearchableSelect
                                value={fabricColorId}
                                onChange={setFabricColorId}
                                options={fabricColors.map(c => ({
                                    value: c.id,
                                    label: `${c.name}${c.color_number ? ` · ${c.color_number}` : ''}`,
                                }))}
                                placeholder="— No specific color —"
                            />
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Meters Required *</label>
                            <input
                                type="number" min="0" step="any"
                                value={metersRequired} onChange={e => setMeters(e.target.value)}
                                placeholder="0.00"
                                className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:border-orange-400"
                            />
                        </div>
                    </>
                )}

                {/* ── TRIM ── */}
                {type === 'trim' && (
                    <>
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Trim Item *</label>
                            <SearchableSelect
                                value={trimItemId}
                                onChange={v => { setTrimItemId(v); setTrimVariantId(''); }}
                                options={trimItems.map(t => ({
                                    value: t.id,
                                    label: `${t.name}${t.code ? ` (${t.code})` : ''}`,
                                }))}
                                placeholder="— Select trim item —"
                            />
                        </div>
                        {trimItemId && (
                            <div>
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Variant *</label>
                                <SearchableSelect
                                    value={trimVariantId}
                                    onChange={setTrimVariantId}
                                    options={trimVariants.map(v => {
                                        // rows come back with variant_id (string), not id
                                        const id = v.variant_id ?? v.id;
                                        const parts = [
                                            v.color_name,
                                            v.color_number,
                                            v.variant_size ? `Sz ${v.variant_size}` : null,
                                            v.brand,
                                        ].filter(Boolean);
                                        const stock = parseFloat(v.main_store_stock);
                                        return {
                                            value: id,
                                            label: `${parts.join(' · ') || `Variant #${id}`}${Number.isFinite(stock) ? ` — ${stock.toLocaleString('en-IN')} in stock` : ''}`,
                                        };
                                    })}
                                    placeholder={loadingVars ? 'Loading variants…' : (trimVariants.length ? '— Select variant —' : 'No variants found')}
                                />
                            </div>
                        )}
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Quantity *</label>
                                <input
                                    type="number" min="0" step="any"
                                    value={quantity} onChange={e => setQuantity(e.target.value)}
                                    placeholder="0"
                                    className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:border-orange-400"
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Unit</label>
                                <UomSelect value={uom} onChange={setUom} />
                            </div>
                        </div>
                    </>
                )}

                {/* ── SPARE ── */}
                {type === 'spare' && (
                    <>
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Spare Part *</label>
                            <SearchableSelect
                                value={spareId}
                                onChange={setSpareId}
                                options={spareParts.map(s => ({
                                    value: s.id,
                                    label: `${s.name}${s.part_number ? ` (${s.part_number})` : ''}`,
                                }))}
                                placeholder="— Select spare part —"
                            />
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Quantity *</label>
                            <input
                                type="number" min="0" step="any"
                                value={quantity} onChange={e => setQuantity(e.target.value)}
                                placeholder="0"
                                className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:border-orange-400"
                            />
                        </div>
                    </>
                )}

                {/* ── OTHER ── */}
                {type === 'other' && (
                    <>
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Item *</label>
                            <div className="flex gap-1.5">
                                <div className="flex-1">
                                    <SearchableSelect
                                        value={generalItemId}
                                        onChange={setGeneralItemId}
                                        options={generalItems.map(i => ({
                                            value: i.id,
                                            label: `${i.name}${i.item_code ? ` (${i.item_code})` : ''}`,
                                        }))}
                                        placeholder="— Select general item —"
                                    />
                                </div>
                                <button
                                    type="button"
                                    onClick={() => { setQuickCreateName(''); setQuickCreateCode(''); setQuickCreateErr(null); setShowQuickCreate(true); }}
                                    title="Create new general item"
                                    className="shrink-0 p-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-500 transition-colors"
                                >
                                    <Plus size={14} />
                                </button>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Quantity *</label>
                                <input
                                    type="number" min="0" step="any"
                                    value={quantity} onChange={e => setQuantity(e.target.value)}
                                    placeholder="0"
                                    className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:border-orange-400"
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Unit</label>
                                <UomSelect value={uom} onChange={setUom} />
                            </div>
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                                Description / Notes <span className="text-slate-300 normal-case font-normal">(optional)</span>
                            </label>
                            <input
                                type="text" value={description}
                                onChange={e => setDescription(e.target.value)}
                                placeholder="Additional details about this request…"
                                className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:border-orange-400"
                            />
                        </div>
                    </>
                )}

                {/* ── SHARED: Urgency ── */}
                <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Urgency</p>
                    <div className="flex gap-2 flex-wrap">
                        {URGENCIES.map(u => (
                            <button
                                key={u.key}
                                onClick={() => setUrgency(u.key)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                                    urgency === u.key
                                        ? `${u.cls} ring-1 ring-current`
                                        : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                                }`}
                            >
                                {u.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* ── SHARED: Estimated Unit Price ── */}
                <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                        Estimated Unit Price <span className="text-slate-300 normal-case font-normal">(optional)</span>
                    </label>
                    <input
                        type="number" min="0" step="any"
                        value={unitPrice} onChange={e => setUnitPrice(e.target.value)}
                        placeholder="0.00"
                        className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:border-orange-400"
                    />
                </div>

                {/* ── SHARED: Notes ── */}
                <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                        Notes <span className="text-slate-300 normal-case font-normal">(optional)</span>
                    </label>
                    <textarea
                        rows={3}
                        value={notes} onChange={e => setNotes(e.target.value)}
                        placeholder="Reason for this request, special requirements, which machine it's for, etc."
                        className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:border-orange-400 resize-none"
                    />
                </div>

                {err && (
                    <div className="flex items-center gap-2 bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-sm text-red-600">
                        <AlertTriangle size={15} className="shrink-0" /> {err}
                    </div>
                )}

                <div className="flex justify-end pt-1">
                    <button
                        onClick={handleSubmit}
                        disabled={busy}
                        className="flex items-center gap-2 text-sm font-bold text-white bg-orange-500 hover:bg-orange-600 disabled:opacity-40 px-6 py-2.5 rounded-xl transition-colors"
                    >
                        {busy ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
                        Submit Request
                    </button>
                </div>
            </div>
            )}

            {/* Historic requirements — remounts (and refetches) after each submit
                because the success screen replaces this whole tree. */}
            <RequirementHistory />
        </div>

            {/* Quick-create general item mini-modal */}
            {showQuickCreate && (
                <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5 space-y-4" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-bold text-slate-800">New General Item</h3>
                            <button onClick={() => setShowQuickCreate(false)} className="p-1 hover:bg-slate-100 rounded-full">
                                <X size={14} className="text-slate-400" />
                            </button>
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Name *</label>
                            <input
                                autoFocus
                                type="text" value={quickCreateName} onChange={e => setQuickCreateName(e.target.value)}
                                placeholder="e.g. Sewing Needle #14"
                                className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:border-orange-400"
                            />
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                                Item Code <span className="text-slate-300 normal-case font-normal">(optional)</span>
                            </label>
                            <input
                                type="text" value={quickCreateCode} onChange={e => setQuickCreateCode(e.target.value)}
                                placeholder="e.g. GI-001"
                                className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:border-orange-400"
                            />
                        </div>
                        {quickCreateErr && (
                            <p className="text-xs text-red-600 flex items-center gap-1">
                                <AlertTriangle size={12} /> {quickCreateErr}
                            </p>
                        )}
                        <div className="flex justify-end gap-2 pt-1">
                            <button
                                onClick={() => setShowQuickCreate(false)}
                                className="text-xs font-medium text-slate-500 border border-slate-200 hover:bg-slate-50 px-3 py-1.5 rounded-lg transition"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleQuickCreate}
                                disabled={quickCreateBusy}
                                className="text-xs font-bold text-white bg-orange-500 hover:bg-orange-600 disabled:opacity-40 px-4 py-1.5 rounded-lg transition flex items-center gap-1.5"
                            >
                                {quickCreateBusy ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
                                Create & Select
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default RaiseRequirementPage;

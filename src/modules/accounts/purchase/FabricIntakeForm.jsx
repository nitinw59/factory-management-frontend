import { useState, useEffect, useCallback } from 'react';
import {
    Loader2, Plus, RefreshCw, Pencil, Trash2, X,
    AlertCircle, ChevronDown, ChevronRight, Search,
    Package, Layers, AlertTriangle, CheckCircle2, FileDown,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { storeManagerApi } from '../../../api/storeManagerApi';

// ─── HELPERS ─────────────────────────────────────────────────────────────────

const fmt = (n, d = 2) => Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: d });

const Spinner = ({ h = 48 }) => (
    <div className="flex justify-center items-center" style={{ minHeight: h * 4 }}>
        <Loader2 className="animate-spin h-7 w-7 text-indigo-500" />
    </div>
);

const Err = ({ msg }) => (
    <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">
        <AlertCircle size={15} className="shrink-0" /> {msg}
    </div>
);

const REQ_STATUS = {
    FULLY_RESERVED:    { cls: 'bg-emerald-100 text-emerald-700', label: 'Fulfilled'    },
    PARTIALLY_RESERVED:{ cls: 'bg-amber-100   text-amber-700',   label: 'Partial'      },
    NOT_RESERVED:      { cls: 'bg-red-100     text-red-700',     label: 'Not Reserved' },
};

const ReqBadge = ({ status }) => {
    const { cls, label } = REQ_STATUS[status] || { cls: 'bg-slate-100 text-slate-500', label: status };
    return <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${cls}`}>{label}</span>;
};

// ─── INTAKE MODAL ─────────────────────────────────────────────────────────────

let _gk = 0, _rk = 0;
const newGroup = () => ({ _k: ++_gk, fabric_type_id: '', uom: 'meter', rolls: [{ _k: ++_rk, fabric_color_id: '', meter: '', bale_no: '' }] });
const newRoll  = () => ({ _k: ++_rk, fabric_color_id: '', meter: '', bale_no: '' });

const IntakeModal = ({ onClose, onSuccess }) => {
    const [formData,   setFormData]   = useState(null);
    const [loading,    setLoading]    = useState(true);
    const [supplierId, setSupplierId] = useState('');
    const [billDate,   setBillDate]   = useState(new Date().toISOString().slice(0, 10));
    const [refNumber,  setRefNumber]  = useState('');
    const [groups,     setGroups]     = useState([newGroup()]);
    const [saving,     setSaving]     = useState(false);
    const [err,        setErr]        = useState(null);

    useEffect(() => {
        storeManagerApi.getFabricIntakeFormData()
            .then(r => setFormData(r.data?.data ?? r.data))
            .catch(() => setErr('Failed to load form data'))
            .finally(() => setLoading(false));
    }, []);

    // ── Group helpers ────────────────────────────────────────────────────────
    const setGroup = (gi, k, v) =>
        setGroups(prev => prev.map((g, i) => i === gi ? { ...g, [k]: v } : g));

    const addGroup = () => setGroups(p => [...p, newGroup()]);

    const removeGroup = (gi) => setGroups(p => p.filter((_, i) => i !== gi));

    // ── Roll helpers ─────────────────────────────────────────────────────────
    const setRoll = (gi, ri, k, v) =>
        setGroups(prev => prev.map((g, i) =>
            i !== gi ? g : { ...g, rolls: g.rolls.map((r, j) => j === ri ? { ...r, [k]: v } : r) }
        ));

    const addRoll = (gi) =>
        setGroups(prev => prev.map((g, i) =>
            i !== gi ? g : { ...g, rolls: [...g.rolls, newRoll()] }
        ));

    const removeRoll = (gi, ri) =>
        setGroups(prev => prev.map((g, i) =>
            i !== gi ? g : { ...g, rolls: g.rolls.filter((_, j) => j !== ri) }
        ));

    // ── Totals ───────────────────────────────────────────────────────────────
    const totalRolls  = groups.reduce((s, g) => s + g.rolls.length, 0);
    const totalMeters = groups.reduce((s, g) =>
        s + g.rolls.reduce((ss, r) => ss + (parseFloat(r.meter) || 0), 0), 0);

    // ── Submit ───────────────────────────────────────────────────────────────
    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!supplierId) { setErr('Select a supplier'); return; }
        for (const g of groups) {
            if (!g.fabric_type_id) { setErr('Select a fabric type for every group'); return; }
            for (const r of g.rolls) {
                if (!r.fabric_color_id || !r.meter || parseFloat(r.meter) <= 0) {
                    setErr('Every roll needs a color and a quantity greater than 0'); return;
                }
            }
        }
        setSaving(true); setErr(null);
        try {
            const rolls = groups.flatMap(g =>
                g.rolls.map(r => ({
                    fabric_type_id:  parseInt(g.fabric_type_id),
                    fabric_color_id: parseInt(r.fabric_color_id),
                    meter:           parseFloat(r.meter),
                    uom:             g.uom,
                    bale_no:         r.bale_no || null,
                }))
            );
            await storeManagerApi.createFabricIntake({
                supplier_id:      parseInt(supplierId),
                bill_date:        billDate,
                reference_number: refNumber || null,
                rolls,
            });
            onSuccess();
            onClose();
        } catch (e) {
            setErr(e?.response?.data?.error || 'Failed to record intake');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col"
                onClick={e => e.stopPropagation()}>

                {/* Modal header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
                    <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Fabric Roll Management</p>
                        <h2 className="font-extrabold text-slate-800 text-base">Record Fabric Intake</h2>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1"><X size={18} /></button>
                </div>

                {loading ? <Spinner /> : (
                    <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">

                        {/* Scrollable body */}
                        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
                            {err && <Err msg={err} />}

                            {/* ── Intake header ── */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Supplier *</label>
                                    <select value={supplierId} onChange={e => setSupplierId(e.target.value)} required
                                        className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-400 bg-white">
                                        <option value="">Select supplier</option>
                                        {(formData?.suppliers || []).map(s => (
                                            <option key={s.id} value={s.id}>{s.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Bill Date *</label>
                                    <input type="date" value={billDate} onChange={e => setBillDate(e.target.value)} required
                                        className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-400" />
                                </div>
                                <div className="col-span-2">
                                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Challan / Reference No.</label>
                                    <input type="text" value={refNumber} onChange={e => setRefNumber(e.target.value)}
                                        placeholder="CH-042, INV-001…"
                                        className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-400" />
                                </div>
                            </div>

                            {/* ── Fabric type groups ── */}
                            <div className="space-y-4">
                                {groups.map((group, gi) => (
                                    <div key={group._k} className="border border-slate-200 rounded-2xl overflow-hidden">

                                        {/* Group header: fabric type + UOM */}
                                        <div className="flex items-center gap-3 px-4 py-3 bg-indigo-50 border-b border-indigo-100">
                                            <Layers size={13} className="text-indigo-400 shrink-0" />
                                            <select
                                                value={group.fabric_type_id}
                                                onChange={e => setGroup(gi, 'fabric_type_id', e.target.value)}
                                                required
                                                className="flex-1 text-sm font-bold text-indigo-800 bg-transparent border-0 focus:outline-none focus:ring-0 cursor-pointer min-w-0"
                                            >
                                                <option value="">Select fabric type…</option>
                                                {(formData?.fabricTypes || []).map(ft => (
                                                    <option key={ft.id} value={ft.id}>{ft.name}</option>
                                                ))}
                                            </select>
                                            <div className="flex items-center gap-1.5 shrink-0">
                                                <span className="text-[10px] font-bold text-indigo-400 uppercase">UOM</span>
                                                <select
                                                    value={group.uom}
                                                    onChange={e => setGroup(gi, 'uom', e.target.value)}
                                                    className="text-xs font-bold text-indigo-700 bg-white border border-indigo-200 rounded-lg px-2 py-1 focus:outline-none focus:border-indigo-400"
                                                >
                                                    <option value="meter">Meters</option>
                                                    <option value="yard">Yards</option>
                                                    <option value="kg">Kg</option>
                                                </select>
                                            </div>
                                            {groups.length > 1 && (
                                                <button type="button" onClick={() => removeGroup(gi)}
                                                    className="p-1 text-indigo-300 hover:text-red-500 transition-colors shrink-0">
                                                    <X size={14} />
                                                </button>
                                            )}
                                        </div>

                                        {/* Rolls inside this group */}
                                        <div className="px-4 py-3 space-y-2">
                                            {/* Column labels */}
                                            <div className="flex items-center gap-3 px-1">
                                                <span className="text-[9px] font-bold text-slate-400 uppercase flex-1">Color</span>
                                                <span className="text-[9px] font-bold text-slate-400 uppercase w-24">Bale No.</span>
                                                <span className="text-[9px] font-bold text-slate-400 uppercase w-24 text-right">
                                                    Meters ({group.uom})
                                                </span>
                                                <span className="w-6" />
                                            </div>

                                            {group.rolls.map((roll, ri) => (
                                                <div key={roll._k} className="flex items-center gap-3">
                                                    <select
                                                        value={roll.fabric_color_id}
                                                        onChange={e => setRoll(gi, ri, 'fabric_color_id', e.target.value)}
                                                        required
                                                        className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-400 bg-white"
                                                    >
                                                        <option value="">Select color</option>
                                                        {(formData?.fabricColors || []).map(fc => (
                                                            <option key={fc.id} value={fc.id}>
                                                                {fc.color_number}{fc.name ? ` · ${fc.name}` : ''}
                                                            </option>
                                                        ))}
                                                    </select>
                                                    <input
                                                        type="text"
                                                        placeholder="B-001"
                                                        value={roll.bale_no}
                                                        onChange={e => setRoll(gi, ri, 'bale_no', e.target.value)}
                                                        className="w-24 text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-400 font-mono"
                                                    />
                                                    <input
                                                        type="number" step="0.01" min="0.01"
                                                        placeholder="0.00"
                                                        value={roll.meter}
                                                        onChange={e => setRoll(gi, ri, 'meter', e.target.value)}
                                                        required
                                                        className="w-24 text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-400 text-right tabular-nums"
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => removeRoll(gi, ri)}
                                                        disabled={group.rolls.length === 1}
                                                        className="p-1.5 text-slate-300 hover:text-red-500 disabled:opacity-0 transition-colors shrink-0"
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>
                                            ))}

                                            {/* Add roll within group */}
                                            <button type="button" onClick={() => addRoll(gi)}
                                                className="flex items-center gap-1 text-xs font-bold text-indigo-500 hover:text-indigo-700 mt-1 transition-colors">
                                                <Plus size={12} /> Add Roll
                                            </button>
                                        </div>

                                        {/* Group subtotal */}
                                        <div className="px-4 py-2 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                                            <span className="text-[10px] text-slate-400">
                                                {group.rolls.length} roll{group.rolls.length !== 1 ? 's' : ''}
                                            </span>
                                            <span className="text-[11px] font-bold text-slate-600 tabular-nums">
                                                {group.rolls.reduce((s, r) => s + (parseFloat(r.meter) || 0), 0).toFixed(2)} {group.uom}
                                            </span>
                                        </div>
                                    </div>
                                ))}

                                {/* Add another fabric type group */}
                                <button type="button" onClick={addGroup}
                                    className="w-full flex items-center justify-center gap-1.5 text-sm font-bold text-indigo-600 hover:text-indigo-800 border-2 border-dashed border-indigo-200 hover:border-indigo-400 rounded-2xl py-3 transition-colors">
                                    <Plus size={14} /> Add Fabric Type Group
                                </button>
                            </div>
                        </div>

                        {/* Footer: totals + actions */}
                        <div className="px-6 py-4 border-t border-slate-100 flex items-center gap-4 shrink-0">
                            <div className="flex-1 flex items-center gap-4">
                                <span className="text-xs text-slate-500">
                                    <span className="font-bold text-slate-700">{totalRolls}</span> roll{totalRolls !== 1 ? 's' : ''}
                                </span>
                                <span className="text-xs text-slate-500">
                                    <span className="font-bold text-slate-700 tabular-nums">{totalMeters.toFixed(2)}</span> m total
                                </span>
                            </div>
                            <button type="button" onClick={onClose}
                                className="text-sm text-slate-500 hover:text-slate-700 px-4 py-2 rounded-lg hover:bg-slate-100 transition-colors">
                                Cancel
                            </button>
                            <button type="submit" disabled={saving}
                                className="flex items-center gap-1.5 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 px-5 py-2 rounded-lg transition-colors">
                                {saving && <Loader2 size={13} className="animate-spin" />}
                                Confirm Intake
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
};

// ─── EDIT ROLL MODAL ─────────────────────────────────────────────────────────

const EditRollModal = ({ roll, colors, onSaved, onDeleted, onClose }) => {
    const [meter,   setMeter]   = useState(String(roll.meter || ''));
    const [uom,     setUom]     = useState(roll.uom || 'meter');
    const [colorId, setColorId] = useState(String(roll.fabric_color_id || ''));
    const [baleNo,  setBaleNo]  = useState(roll.bale_no || '');
    const [saving,  setSaving]  = useState(false);
    const [deleting,setDeleting]= useState(false);
    const [confirm, setConfirm] = useState(false);
    const [err,     setErr]     = useState(null);

    const handleSave = async (e) => {
        e.preventDefault();
        if (!meter || parseFloat(meter) <= 0) { setErr('Enter a valid quantity'); return; }
        setSaving(true); setErr(null);
        try {
            await storeManagerApi.updateFabricRoll(roll.roll_id, {
                meter:           parseFloat(meter),
                uom,
                fabric_color_id: colorId ? parseInt(colorId) : undefined,
                bale_no:         baleNo || null,
            });
            onSaved();
        } catch (e) {
            setErr(e?.response?.data?.error || 'Failed to save');
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        setDeleting(true); setErr(null);
        try {
            await storeManagerApi.deleteFabricRoll(roll.roll_id);
            onDeleted();
        } catch (e) {
            setErr(e?.response?.data?.error || 'Cannot delete — roll may be assigned or in production');
            setDeleting(false);
            setConfirm(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                    <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Edit Roll</p>
                        <h2 className="font-extrabold text-slate-800">R-{roll.roll_id}</h2>
                        <p className="text-xs text-slate-400">{roll.fabric_type} · {roll.fabric_color}</p>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1"><X size={18} /></button>
                </div>

                <form onSubmit={handleSave} className="px-5 py-4 space-y-4">
                    {err && <Err msg={err} />}

                    <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Color</label>
                        <select value={colorId} onChange={e => setColorId(e.target.value)}
                            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-400 bg-white">
                            <option value="">— No change —</option>
                            {colors.map(fc => (
                                <option key={fc.id} value={fc.id}>{fc.color_number}{fc.name ? ` · ${fc.name}` : ''}</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Bale No.</label>
                        <input type="text" placeholder="B-001" value={baleNo} onChange={e => setBaleNo(e.target.value)}
                            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-400 font-mono" />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Quantity *</label>
                            <input type="number" step="0.01" min="0.01" value={meter} onChange={e => setMeter(e.target.value)} required
                                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-400" />
                        </div>
                        <div>
                            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Unit</label>
                            <select value={uom} onChange={e => setUom(e.target.value)}
                                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-400 bg-white">
                                <option value="meter">Meters</option>
                                <option value="yard">Yards</option>
                                <option value="kg">Kg</option>
                            </select>
                        </div>
                    </div>

                    {confirm ? (
                        <div className="bg-red-50 border border-red-200 rounded-xl p-3 space-y-3">
                            <p className="text-sm font-bold text-red-700">Delete R-{roll.roll_id}? This cannot be undone.</p>
                            <div className="flex gap-2">
                                <button type="button" onClick={handleDelete} disabled={deleting}
                                    className="flex-1 flex items-center justify-center gap-1.5 text-sm font-bold text-white bg-red-500 hover:bg-red-600 disabled:opacity-50 py-2 rounded-lg transition-colors">
                                    {deleting && <Loader2 size={13} className="animate-spin" />} Yes, Delete
                                </button>
                                <button type="button" onClick={() => setConfirm(false)}
                                    className="flex-1 text-sm text-slate-600 border border-slate-200 py-2 rounded-lg hover:bg-slate-50 transition-colors">
                                    Cancel
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                            <button type="button" onClick={() => setConfirm(true)}
                                className="flex items-center gap-1.5 text-sm text-red-500 hover:text-red-700 px-3 py-2 rounded-lg hover:bg-red-50 transition-colors font-medium">
                                <Trash2 size={14} /> Delete Roll
                            </button>
                            <div className="flex gap-2">
                                <button type="button" onClick={onClose}
                                    className="text-sm text-slate-500 px-3 py-2 rounded-lg hover:bg-slate-100 transition-colors">
                                    Cancel
                                </button>
                                <button type="submit" disabled={saving}
                                    className="flex items-center gap-1.5 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 px-4 py-2 rounded-lg transition-colors">
                                    {saving && <Loader2 size={13} className="animate-spin" />} Save
                                </button>
                            </div>
                        </div>
                    )}
                </form>
            </div>
        </div>
    );
};

// ─── POOL ROLL DETAIL MODAL ───────────────────────────────────────────────────

const PoolRollDetailModal = ({ row, allRolls, colors, onClose, onRefresh }) => {
    const [editRoll, setEditRoll] = useState(null);

    const matching = allRolls.filter(
        r => r.fabric_type_id === row.fabric_type_id && r.fabric_color_id === row.fabric_color_id
    );
    const inStock     = matching.filter(r => r.status === 'IN_STOCK');
    const inProd      = matching.filter(r => r.status === 'IN_PRODUCTION');

    const RollRow = ({ r }) => (
        <div className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 group transition-colors">
            <span className="font-mono font-bold text-indigo-600 text-xs w-14 shrink-0">R-{r.roll_id}</span>
            {r.bale_no && (
                <span className="font-mono text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded shrink-0">{r.bale_no}</span>
            )}
            <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-slate-700">{fmt(r.meter)} {r.uom}</p>
                <p className="text-[10px] text-slate-400 truncate">
                    {r.challan_number && <span>{r.challan_number} · </span>}
                    {r.supplier_name}
                    {r.bill_date && <span className="ml-1">· {new Date(r.bill_date).toLocaleDateString('en', { month: 'short', day: 'numeric', year: '2-digit' })}</span>}
                </p>
            </div>
            {r.so_number && (
                <span className="text-[9px] font-mono bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded shrink-0">{r.so_number}</span>
            )}
            <button onClick={() => setEditRoll(r)}
                className="p-1 text-slate-300 hover:text-indigo-600 opacity-0 group-hover:opacity-100 transition-colors shrink-0">
                <Pencil size={12} />
            </button>
        </div>
    );

    return (
        <>
            <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col"
                    onClick={e => e.stopPropagation()}>
                    {/* Header */}
                    <div className="px-5 py-4 border-b border-slate-100 flex items-start justify-between shrink-0">
                        <div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Inventory Pool</p>
                            <h2 className="font-extrabold text-slate-800 text-base">{row.fabric_type}</h2>
                            <p className="text-xs text-slate-500">
                                {row.fabric_color}
                                {row.color_number && <span className="ml-1 text-slate-400">({row.color_number})</span>}
                            </p>
                        </div>
                        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1"><X size={18} /></button>
                    </div>

                    {/* Summary bar */}
                    <div className="grid grid-cols-4 divide-x divide-slate-100 border-b border-slate-100 shrink-0">
                        {[
                            { label: 'In Stock',      val: row.in_stock_meters,     cls: 'text-emerald-600' },
                            { label: 'Reserved',      val: row.reserved_meters,     cls: 'text-amber-600'   },
                            { label: 'In Production', val: row.in_production_meters,cls: 'text-blue-600'    },
                            { label: 'Free',          val: row.free_meters,         cls: row.free_meters <= 0 ? 'text-red-500' : 'text-emerald-700' },
                        ].map(({ label, val, cls }) => (
                            <div key={label} className="px-4 py-2.5 text-center">
                                <p className="text-[9px] font-bold text-slate-400 uppercase">{label}</p>
                                <p className={`text-sm font-extrabold ${cls}`}>{fmt(val)} m</p>
                            </div>
                        ))}
                    </div>

                    {/* Rolls */}
                    <div className="flex-1 overflow-y-auto divide-y divide-slate-50">
                        {/* IN_STOCK section */}
                        <div>
                            <div className="flex items-center gap-2 px-4 py-2 bg-emerald-50 sticky top-0">
                                <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                                <p className="text-[9px] font-bold text-emerald-700 uppercase tracking-wider">
                                    In Stock — {inStock.length} roll{inStock.length !== 1 ? 's' : ''}
                                </p>
                            </div>
                            {inStock.length === 0 ? (
                                <p className="px-4 py-3 text-xs text-slate-400 italic">No in-stock rolls</p>
                            ) : (
                                inStock.map(r => <RollRow key={r.roll_id} r={r} />)
                            )}
                        </div>

                        {/* IN_PRODUCTION section — shown only when data exists */}
                        {(row.in_production_meters > 0 || inProd.length > 0) && (
                            <div>
                                <div className="flex items-center gap-2 px-4 py-2 bg-blue-50 sticky top-0">
                                    <span className="w-2 h-2 rounded-full bg-blue-400 shrink-0" />
                                    <p className="text-[9px] font-bold text-blue-700 uppercase tracking-wider">
                                        In Production
                                        {inProd.length > 0 ? ` — ${inProd.length} roll${inProd.length !== 1 ? 's' : ''}` : ` — ${fmt(row.in_production_meters)} m`}
                                    </p>
                                </div>
                                {inProd.length > 0
                                    ? inProd.map(r => <RollRow key={r.roll_id} r={r} />)
                                    : <p className="px-4 py-3 text-xs text-slate-400 italic">{fmt(row.in_production_meters)} m across production batches</p>
                                }
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {editRoll && (
                <EditRollModal
                    roll={editRoll}
                    colors={colors}
                    onSaved={() => { setEditRoll(null); onRefresh(); }}
                    onDeleted={() => { setEditRoll(null); onClose(); onRefresh(); }}
                    onClose={() => setEditRoll(null)}
                />
            )}
        </>
    );
};

// ─── POOL CARD ────────────────────────────────────────────────────────────────

const PoolCard = ({ row, onClick, dim }) => {
    const usedPct = row.total_meters > 0 ? ((row.total_meters - row.free_meters) / row.total_meters) * 100 : 0;
    return (
        <button type="button" onClick={onClick}
            className={`w-full text-left bg-white border rounded-2xl p-5 shadow-sm hover:shadow-md hover:border-indigo-300 transition-all cursor-pointer ${dim ? 'opacity-50 border-slate-200' : 'border-slate-200'}`}>
            <div className="flex items-start justify-between mb-3">
                <div className="min-w-0">
                    <p className="font-extrabold text-slate-800 text-sm truncate">{row.fabric_type}</p>
                    <p className="text-xs text-slate-500 mt-0.5 truncate">
                        <span className="font-bold text-slate-600">{row.fabric_color}</span>
                        {row.color_number && <span className="ml-1 text-slate-400">({row.color_number})</span>}
                    </p>
                </div>
                <span className={`text-[10px] font-bold shrink-0 ml-2 px-2 py-0.5 rounded-full border ${
                    dim ? 'bg-slate-50 text-slate-400 border-slate-200' : 'bg-indigo-50 text-indigo-600 border-indigo-100'
                }`}>
                    {row.roll_count} roll{row.roll_count !== 1 ? 's' : ''}
                </span>
            </div>

            <div className="grid grid-cols-2 gap-y-2 gap-x-3 text-xs mb-3">
                <div>
                    <p className="text-[9px] font-bold text-slate-400 uppercase mb-0.5">Total</p>
                    <p className="font-bold text-slate-700">{fmt(row.total_meters)} m</p>
                </div>
                <div>
                    <p className="text-[9px] font-bold text-slate-400 uppercase mb-0.5">In Stock</p>
                    <p className={`font-bold ${row.in_stock_meters > 0 ? 'text-emerald-600' : 'text-slate-300'}`}>{fmt(row.in_stock_meters)} m</p>
                </div>
                <div>
                    <p className="text-[9px] font-bold text-slate-400 uppercase mb-0.5">Reserved</p>
                    <p className="font-bold text-amber-600">{fmt(row.reserved_meters)} m</p>
                </div>
                <div>
                    <p className="text-[9px] font-bold text-slate-400 uppercase mb-0.5">In Production</p>
                    <p className="font-bold text-blue-600">{fmt(row.in_production_meters)} m</p>
                </div>
            </div>

            <div className="space-y-1">
                <div className="flex justify-between text-[9px] font-bold text-slate-400 uppercase">
                    <span>Free</span>
                    <span className={row.free_meters <= 0 ? 'text-red-500' : 'text-emerald-600'}>{fmt(row.free_meters)} m</span>
                </div>
                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${usedPct >= 90 ? 'bg-red-400' : usedPct >= 60 ? 'bg-amber-400' : 'bg-emerald-400'}`}
                        style={{ width: `${Math.min(100, usedPct)}%` }} />
                </div>
            </div>
        </button>
    );
};

// ─── POOL TAB ────────────────────────────────────────────────────────────────

const PoolTab = ({ pool, allRolls, colors, onRefreshRolls }) => {
    const [selected,      setSelected]      = useState(null);
    const [showZeroStock, setShowZeroStock] = useState(false);

    if (!pool || pool.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                <Package size={36} className="mb-3 opacity-30" />
                <p className="text-sm">No fabric in inventory</p>
            </div>
        );
    }

    const inStock    = pool.filter(r => r.in_stock_meters > 0);
    const zeroStock  = pool.filter(r => r.in_stock_meters === 0);

    return (
        <>
            {inStock.length === 0 && (
                <p className="text-sm text-slate-400 italic mb-4">No fabric currently in stock.</p>
            )}

            {inStock.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 mb-6">
                    {inStock.map((row, i) => (
                        <PoolCard key={i} row={row} onClick={() => setSelected(row)} />
                    ))}
                </div>
            )}

            {zeroStock.length > 0 && (
                <div>
                    <button
                        onClick={() => setShowZeroStock(p => !p)}
                        className="flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-slate-600 mb-3 transition-colors"
                    >
                        {showZeroStock ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                        {zeroStock.length} out-of-stock fabric type{zeroStock.length !== 1 ? 's' : ''}
                    </button>
                    {showZeroStock && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                            {zeroStock.map((row, i) => (
                                <PoolCard key={i} row={row} dim onClick={() => setSelected(row)} />
                            ))}
                        </div>
                    )}
                </div>
            )}

            {selected && (
                <PoolRollDetailModal
                    row={selected}
                    allRolls={allRolls}
                    colors={colors}
                    onClose={() => setSelected(null)}
                    onRefresh={() => { setSelected(null); onRefreshRolls(); }}
                />
            )}
        </>
    );
};

// ─── REQUIREMENTS TAB ────────────────────────────────────────────────────────

const RequirementsTab = ({ requirements }) => {
    const [expanded, setExpanded] = useState(new Set());
    const toggle = (id) => setExpanded(prev => {
        const next = new Set(prev);
        next.has(id) ? next.delete(id) : next.add(id);
        return next;
    });

    if (!requirements || requirements.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                <Layers size={36} className="mb-3 opacity-30" />
                <p className="text-sm">No open fabric requirements</p>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            {requirements.map(req => {
                const pct = req.meters_required > 0 ? (req.meters_reserved / req.meters_required) * 100 : 0;
                const isExpanded = expanded.has(req.requirement_id);
                const hasRolls = (req.reserved_rolls || []).length > 0;

                return (
                    <div key={req.requirement_id} className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                        <div
                            className={`flex items-center gap-3 px-5 py-4 ${hasRolls ? 'cursor-pointer hover:bg-slate-50' : ''}`}
                            onClick={() => hasRolls && toggle(req.requirement_id)}
                        >
                            {hasRolls ? (
                                isExpanded ? <ChevronDown size={14} className="text-slate-400 shrink-0" /> : <ChevronRight size={14} className="text-slate-400 shrink-0" />
                            ) : <div className="w-3.5 shrink-0" />}

                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap mb-1">
                                    <p className="text-sm font-extrabold text-slate-800 truncate">
                                        {req.fabric_type} · {req.fabric_color}
                                        {req.color_number && <span className="font-normal text-slate-400 ml-1">({req.color_number})</span>}
                                    </p>
                                    <ReqBadge status={req.status} />
                                </div>
                                <div className="flex items-center gap-4 text-xs text-slate-500">
                                    <span>{req.order_number} — {req.product_name}</span>
                                    <span className="font-mono font-bold text-slate-700">
                                        {fmt(req.meters_reserved)} / {fmt(req.meters_required)} m
                                    </span>
                                </div>
                                <div className="mt-2 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                    <div
                                        className={`h-full rounded-full ${pct >= 100 ? 'bg-emerald-400' : pct > 0 ? 'bg-amber-400' : 'bg-slate-200'}`}
                                        style={{ width: `${Math.min(100, pct)}%` }}
                                    />
                                </div>
                            </div>
                        </div>

                        {isExpanded && hasRolls && (
                            <div className="border-t border-slate-100 bg-slate-50 px-5 py-3">
                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-2">Reserved Rolls</p>
                                <div className="space-y-2">
                                    {req.reserved_rolls.map(rr => (
                                        <div key={rr.reservation_id} className="flex items-center gap-4 bg-white border border-slate-100 rounded-xl px-4 py-2.5 text-xs">
                                            <span className="font-mono font-bold text-indigo-600 w-14 shrink-0">R-{rr.roll_id}</span>
                                            {rr.bale_no && (
                                                <span className="font-mono text-[9px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded shrink-0">{rr.bale_no}</span>
                                            )}
                                            <div className="flex-1 min-w-0">
                                                <p className="font-bold text-slate-700">
                                                    {fmt(rr.meters_reserved)} m reserved
                                                    <span className="font-normal text-slate-400 ml-1">of {fmt(rr.roll_total_meter)} m roll</span>
                                                </p>
                                                <p className="text-slate-400 truncate">
                                                    {rr.challan_number && <span>{rr.challan_number} · </span>}{rr.supplier_name}
                                                </p>
                                            </div>
                                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                                                rr.roll_status === 'IN_STOCK' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'
                                            }`}>{rr.roll_status?.replace('_', ' ')}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
};

// ─── ALL ROLLS TAB ────────────────────────────────────────────────────────────

const RollsTable = ({ rolls, onEdit }) => (
    <div className="overflow-x-auto">
        <table className="w-full text-xs">
            <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                    <th className="text-left px-4 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-wider">Roll</th>
                    <th className="text-left px-4 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-wider">Bale No.</th>
                    <th className="text-right px-4 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-wider">Meters</th>
                    <th className="text-left px-4 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-wider">Challan</th>
                    <th className="text-left px-4 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-wider">Bill Date</th>
                    <th className="text-left px-4 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-wider">Supplier</th>
                    <th className="text-left px-4 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-wider">PO</th>
                    <th className="text-left px-4 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-wider">SO</th>
                    <th className="px-4 py-2 w-8" />
                </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
                {rolls.map(r => (
                    <tr key={r.roll_id} className="hover:bg-slate-50 transition-colors group">
                        <td className="px-4 py-2.5 font-mono font-bold text-indigo-600">R-{r.roll_id}</td>
                        <td className="px-4 py-2.5 font-mono text-slate-600">{r.bale_no || '—'}</td>
                        <td className="px-4 py-2.5 text-right font-bold text-slate-800">
                            {fmt(r.meter)} <span className="font-normal text-slate-400">{r.uom}</span>
                        </td>
                        <td className="px-4 py-2.5 font-mono text-slate-500">{r.challan_number || '—'}</td>
                        <td className="px-4 py-2.5 text-slate-500">
                            {r.bill_date ? new Date(r.bill_date).toLocaleDateString('en', { month: 'short', day: 'numeric', year: '2-digit' }) : '—'}
                        </td>
                        <td className="px-4 py-2.5 text-slate-600">{r.supplier_name || '—'}</td>
                        <td className="px-4 py-2.5">
                            {r.po_code ? <span className="font-mono bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">{r.po_code}</span> : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-4 py-2.5">
                            {r.so_number ? <span className="font-mono bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded">{r.so_number}</span> : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                            <button onClick={() => onEdit(r)}
                                className="p-1 text-slate-300 hover:text-indigo-600 rounded transition-colors opacity-0 group-hover:opacity-100">
                                <Pencil size={12} />
                            </button>
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    </div>
);

const exportToXlsx = (rolls) => {
    const ts = new Date().toLocaleDateString('en', { day: '2-digit', month: 'short', year: 'numeric' });

    // ── Sheet 1: Detailed roll list ──────────────────────────────────────────
    const detailRows = rolls.map(r => ({
        'Roll ID':      `R-${r.roll_id}`,
        'Bale No.':     r.bale_no         || '',
        'Fabric Type':  r.fabric_type     || '',
        'Color':        r.fabric_color    || '',
        'Color Code':   r.color_number    || '',
        'Meters':       parseFloat(r.meter || 0),
        'UOM':          r.uom             || 'meter',
        'Status':       r.status          || '',
        'Challan No.':  r.challan_number  || '',
        'Bill Date':    r.bill_date ? new Date(r.bill_date).toLocaleDateString('en-GB') : '',
        'Supplier':     r.supplier_name   || '',
        'PO Code':      r.po_code         || '',
        'PO Status':    r.po_status       || '',
        'SO Number':    r.so_number       || '',
        'SO Status':    r.so_status       || '',
        'Intake Date':  r.intake_date ? new Date(r.intake_date).toLocaleDateString('en-GB') : '',
    }));

    const wsDetail = XLSX.utils.json_to_sheet(detailRows);

    // Column widths for sheet 1
    wsDetail['!cols'] = [
        { wch: 10 }, { wch: 12 }, { wch: 16 }, { wch: 14 }, { wch: 12 },
        { wch: 10 }, { wch: 8  }, { wch: 12 }, { wch: 14 },
        { wch: 12 }, { wch: 20 }, { wch: 14 }, { wch: 12 },
        { wch: 14 }, { wch: 12 }, { wch: 14 },
    ];

    // ── Sheet 2: Grouped summary ─────────────────────────────────────────────
    // Build groups: fabric type → color → aggregate
    const groups = {};
    rolls.forEach(r => {
        const tk = r.fabric_type_id;
        if (!groups[tk]) groups[tk] = { type: r.fabric_type, colors: {} };
        const ck = r.fabric_color_id;
        if (!groups[tk].colors[ck]) {
            groups[tk].colors[ck] = {
                color: r.fabric_color, color_number: r.color_number,
                roll_count: 0, total_meters: 0,
            };
        }
        groups[tk].colors[ck].roll_count  += 1;
        groups[tk].colors[ck].total_meters += parseFloat(r.meter || 0);
    });

    const summaryRows = [];
    Object.values(groups).forEach(tg => {
        let typeTotal = 0;
        let typeRolls = 0;
        Object.values(tg.colors).forEach(cg => {
            summaryRows.push({
                'Fabric Type':   tg.type,
                'Color':         cg.color       || '',
                'Color Code':    cg.color_number || '',
                'Rolls':         cg.roll_count,
                'Total Meters':  parseFloat(cg.total_meters.toFixed(2)),
            });
            typeTotal += cg.total_meters;
            typeRolls += cg.roll_count;
        });
        // Subtotal row per fabric type
        summaryRows.push({
            'Fabric Type':  `${tg.type} — SUBTOTAL`,
            'Color':        '',
            'Color Code':   '',
            'Rolls':        typeRolls,
            'Total Meters': parseFloat(typeTotal.toFixed(2)),
        });
        summaryRows.push({}); // blank separator
    });

    // Grand total
    const grandRolls  = rolls.length;
    const grandMeters = rolls.reduce((s, r) => s + parseFloat(r.meter || 0), 0);
    summaryRows.push({
        'Fabric Type':  'GRAND TOTAL',
        'Color':        '',
        'Color Code':   '',
        'Rolls':        grandRolls,
        'Total Meters': parseFloat(grandMeters.toFixed(2)),
    });

    const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
    wsSummary['!cols'] = [{ wch: 24 }, { wch: 14 }, { wch: 12 }, { wch: 8 }, { wch: 14 }];

    // ── Workbook ─────────────────────────────────────────────────────────────
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, wsDetail,  'Detailed Rolls');
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary by Type & Color');
    XLSX.writeFile(wb, `fabric-rolls-${ts.replace(/ /g, '-')}.xlsx`);
};

const AllRollsTab = ({ rolls, colors, onRefresh }) => {
    const [search,   setSearch]   = useState('');
    const [editRoll, setEditRoll] = useState(null);
    const [expanded, setExpanded] = useState(new Set());

    const q = search.toLowerCase().trim();
    const filtered = q
        ? rolls.filter(r =>
            r.fabric_type?.toLowerCase().includes(q) ||
            r.fabric_color?.toLowerCase().includes(q) ||
            r.color_number?.toLowerCase().includes(q) ||
            r.bale_no?.toLowerCase().includes(q) ||
            r.challan_number?.toLowerCase().includes(q) ||
            r.supplier_name?.toLowerCase().includes(q) ||
            r.po_code?.toLowerCase().includes(q) ||
            String(r.roll_id).includes(q)
          )
        : rolls;

    // Group: fabric_type_id → fabric_color_id → rolls
    const byType = {};
    filtered.forEach(r => {
        const tk = r.fabric_type_id;
        if (!byType[tk]) byType[tk] = { label: r.fabric_type, colors: {} };
        const ck = r.fabric_color_id;
        if (!byType[tk].colors[ck]) byType[tk].colors[ck] = { label: r.fabric_color, color_number: r.color_number, rolls: [] };
        byType[tk].colors[ck].rolls.push(r);
    });

    const typeKeys = Object.keys(byType);

    const toggleKey = (k) => setExpanded(prev => {
        const next = new Set(prev); next.has(k) ? next.delete(k) : next.add(k); return next;
    });

    // Auto-expand all type+color groups on first render or when search changes
    useEffect(() => {
        const keys = new Set();
        Object.keys(byType).forEach(tk => Object.keys(byType[tk].colors).forEach(ck => keys.add(`${tk}-${ck}`)));
        setExpanded(keys);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search, rolls.length]);

    if (rolls.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                <Package size={36} className="mb-3 opacity-30" />
                <p className="text-sm">No in-stock rolls</p>
            </div>
        );
    }

    return (
        <>
            <div className="mb-4 flex items-center gap-3">
                <div className="relative flex-1 max-w-xs">
                    <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    <input type="search" placeholder="Search rolls, type, color, challan…"
                        value={search} onChange={e => setSearch(e.target.value)}
                        className="w-full text-xs pl-8 pr-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-400" />
                </div>
                <span className="text-xs text-slate-400 mr-auto">{filtered.length} roll{filtered.length !== 1 ? 's' : ''}</span>
                <button
                    onClick={() => exportToXlsx(filtered)}
                    className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-3 py-2 rounded-lg transition-colors"
                    title="Download .xlsx — Sheet 1: all rolls · Sheet 2: grouped summary"
                >
                    <FileDown size={13} /> Export .xlsx
                </button>
            </div>

            <div className="space-y-4">
                {typeKeys.map(tk => {
                    const typeGroup = byType[tk];
                    const colorKeys = Object.keys(typeGroup.colors);
                    const totalRolls = colorKeys.reduce((s, ck) => s + typeGroup.colors[ck].rolls.length, 0);
                    const totalMeters = colorKeys.reduce((s, ck) =>
                        s + typeGroup.colors[ck].rolls.reduce((ss, r) => ss + parseFloat(r.meter || 0), 0), 0);

                    return (
                        <div key={tk} className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                            {/* Fabric type header */}
                            <div className="flex items-center gap-3 px-5 py-3 bg-indigo-50 border-b border-indigo-100">
                                <Layers size={14} className="text-indigo-500 shrink-0" />
                                <p className="font-extrabold text-indigo-800 text-sm flex-1">{typeGroup.label}</p>
                                <span className="text-[10px] font-bold text-indigo-600">{totalRolls} roll{totalRolls !== 1 ? 's' : ''}</span>
                                <span className="text-[10px] font-bold text-indigo-500">{fmt(totalMeters)} m total</span>
                            </div>

                            {/* Color sub-groups */}
                            {colorKeys.map(ck => {
                                const colorGroup = typeGroup.colors[ck];
                                const groupKey = `${tk}-${ck}`;
                                const isOpen = expanded.has(groupKey);
                                const groupMeters = colorGroup.rolls.reduce((s, r) => s + parseFloat(r.meter || 0), 0);

                                return (
                                    <div key={ck} className="border-t border-slate-100 first:border-t-0">
                                        {/* Color row — click to expand/collapse */}
                                        <button type="button" onClick={() => toggleKey(groupKey)}
                                            className="w-full flex items-center gap-3 px-5 py-3 hover:bg-slate-50 transition-colors text-left">
                                            {isOpen ? <ChevronDown size={13} className="text-slate-400 shrink-0" /> : <ChevronRight size={13} className="text-slate-400 shrink-0" />}
                                            <div className="flex-1 min-w-0 flex items-center gap-2">
                                                <span className="text-sm font-bold text-slate-700">
                                                    {colorGroup.color_number || colorGroup.label}
                                                </span>
                                                {colorGroup.color_number && colorGroup.label && (
                                                    <span className="text-xs text-slate-400">({colorGroup.label})</span>
                                                )}
                                            </div>
                                            <span className="text-xs text-slate-500 shrink-0">{colorGroup.rolls.length} roll{colorGroup.rolls.length !== 1 ? 's' : ''}</span>
                                            <span className="text-xs font-bold text-slate-700 shrink-0 ml-2">{fmt(groupMeters)} m</span>
                                        </button>

                                        {isOpen && (
                                            <RollsTable rolls={colorGroup.rolls} onEdit={setEditRoll} />
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    );
                })}
            </div>

            {editRoll && (
                <EditRollModal
                    roll={editRoll}
                    colors={colors}
                    onSaved={() => { setEditRoll(null); onRefresh(); }}
                    onDeleted={() => { setEditRoll(null); onRefresh(); }}
                    onClose={() => setEditRoll(null)}
                />
            )}
        </>
    );
};

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────

const FabricRollManagementPage = () => {
    const [tab,          setTab]          = useState('pool');
    const [inventory,    setInventory]    = useState(null);
    const [allRolls,     setAllRolls]     = useState([]);
    const [colors,       setColors]       = useState([]);
    const [loading,      setLoading]      = useState(true);
    const [rollsLoading, setRollsLoading] = useState(false);
    const [err,          setErr]          = useState(null);
    const [showIntake,   setShowIntake]   = useState(false);

    const loadInventory = useCallback(async () => {
        setErr(null);
        try {
            const r = await storeManagerApi.getFabricInventory();
            setInventory(r.data?.data ?? r.data);
        } catch (e) {
            setErr(e?.response?.data?.error || 'Failed to load inventory');
        }
    }, []);

    const loadRolls = useCallback(async () => {
        setRollsLoading(true);
        try {
            const [rollsRes, colorsRes] = await Promise.all([
                storeManagerApi.getInStockFabricRolls(),
                storeManagerApi.getFabricColors(),
            ]);
            setAllRolls(rollsRes.data?.data ?? rollsRes.data ?? []);
            setColors(colorsRes.data?.data ?? colorsRes.data ?? []);
        } catch (e) {
            setErr(e?.response?.data?.error || 'Failed to load rolls');
        } finally {
            setRollsLoading(false);
        }
    }, []);

    const loadAll = useCallback(async () => {
        setLoading(true);
        await Promise.all([loadInventory(), loadRolls()]);
        setLoading(false);
    }, [loadInventory, loadRolls]);

    useEffect(() => { loadAll(); }, [loadAll]);

    const pool         = inventory?.pool         || [];
    const requirements = inventory?.requirements || [];

    const TABS = [
        { key: 'pool',         label: 'Inventory Pool', count: pool.length },
        { key: 'requirements', label: 'Requirements',   count: requirements.length },
        { key: 'rolls',        label: 'All Rolls',      count: allRolls.length },
    ];

    const openReqs = requirements.filter(r => r.status !== 'FULLY_RESERVED').length;

    return (
        <div className="min-h-screen bg-slate-50">
            {/* Page header */}
            <div className="bg-white border-b border-slate-200 px-6 py-5">
                <div className="max-w-7xl mx-auto flex items-start justify-between gap-4">
                    <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Store Management</p>
                        <h1 className="text-xl font-extrabold text-slate-800">Fabric Roll Management</h1>
                        {!loading && (
                            <div className="flex items-center gap-4 mt-1.5 flex-wrap">
                                <span className="text-xs text-slate-500 flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 inline-block" />
                                    {pool.length} fabric types in pool
                                </span>
                                {openReqs > 0 && (
                                    <span className="text-xs text-amber-600 font-bold flex items-center gap-1">
                                        <AlertTriangle size={11} /> {openReqs} open requirement{openReqs !== 1 ? 's' : ''}
                                    </span>
                                )}
                                <span className="text-xs text-slate-500 flex items-center gap-1">
                                    <CheckCircle2 size={11} className="text-emerald-500" />
                                    {allRolls.length} rolls in stock
                                </span>
                            </div>
                        )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <button onClick={loadAll} disabled={loading}
                            className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50">
                            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
                        </button>
                        <button onClick={() => setShowIntake(true)}
                            className="flex items-center gap-1.5 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 px-4 py-2 rounded-lg transition-colors">
                            <Plus size={15} /> Record Intake
                        </button>
                    </div>
                </div>
            </div>

            {/* Tabs */}
            <div className="bg-white border-b border-slate-200 px-6">
                <div className="max-w-7xl mx-auto flex gap-1">
                    {TABS.map(t => (
                        <button
                            key={t.key}
                            onClick={() => setTab(t.key)}
                            className={`relative flex items-center gap-1.5 px-4 py-3 text-sm font-bold transition-colors border-b-2 ${
                                tab === t.key
                                    ? 'border-indigo-600 text-indigo-700'
                                    : 'border-transparent text-slate-500 hover:text-slate-700'
                            }`}
                        >
                            {t.label}
                            {t.count > 0 && (
                                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                                    tab === t.key ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500'
                                }`}>{t.count}</span>
                            )}
                        </button>
                    ))}
                </div>
            </div>

            {/* Content */}
            <div className="max-w-7xl mx-auto px-6 py-6">
                {err && <div className="mb-4"><Err msg={err} /></div>}

                {loading ? (
                    <Spinner />
                ) : (
                    <>
                        {tab === 'pool'         && <PoolTab pool={pool} allRolls={allRolls} colors={colors} onRefreshRolls={loadRolls} />}
                        {tab === 'requirements' && <RequirementsTab requirements={requirements} />}
                        {tab === 'rolls'        && (
                            rollsLoading
                                ? <Spinner />
                                : <AllRollsTab rolls={allRolls} colors={colors} onRefresh={loadRolls} />
                        )}
                    </>
                )}
            </div>

            {showIntake && (
                <IntakeModal
                    onClose={() => setShowIntake(false)}
                    onSuccess={loadAll}
                />
            )}
        </div>
    );
};

export default FabricRollManagementPage;

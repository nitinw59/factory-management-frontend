import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    Plus, FileText, Loader2, X, ChevronDown, ChevronRight,
    AlertCircle, Scissors, ArrowLeft, Check, XCircle, Ruler,
} from 'lucide-react';
import { bomApi } from '../../api/bomApi';
import { accountingApi } from '../../api/accountingApi';

const genKey = () => `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

const freshFabric = () => ({ _key: genKey(), fabric_type_id: '', consumption_inches: '' });

const freshRatioGroup = () => ({
    _key: genKey(), ratio_group_name: '', marker_length_inches: '',
    fabrics: [freshFabric()],
    items: [],
});

const freshMaterial = () => ({
    _key: genKey(), trim_item_id: '',
    calculation_type: 'FIXED', fixed_quantity: '',
    placement_description: '', wastage_percentage: '',
    size_consumptions: [],
});

// ─── Section wrapper ──────────────────────────────────────────────────────────

const Section = ({ title, action, children }) => (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 bg-slate-50">
            <h2 className="font-bold text-slate-700 text-sm">{title}</h2>
            {action}
        </div>
        <div className="p-5">{children}</div>
    </div>
);

const AddBtn = ({ onClick, label }) => (
    <button onClick={onClick}
        className="flex items-center gap-1 text-xs font-bold text-violet-600 hover:text-violet-700 bg-violet-50 hover:bg-violet-100 px-3 py-1.5 rounded-lg transition-colors">
        <Plus size={12} /> {label}
    </button>
);

// ─── Ratio Group Accordion ────────────────────────────────────────────────────

const RatioGroupCard = ({ group, gIdx, expanded, onToggle, onUpdate, onRemove, canRemove, fabricTypes, sizes }) => {
    const totalPieces = group.items.reduce((s, it) => s + (parseInt(it.number_of_pieces) || 0), 0);
    const sizeSummary = group.items.filter(it => it.size).map(it => `${it.size}×${it.number_of_pieces}`).join(' · ');

    const updItems = (items) => onUpdate(gIdx, 'items', items);
    const addSize = (sizeName) => updItems([...group.items, { _key: genKey(), size: sizeName, number_of_pieces: 1 }]);
    const removeSize = (sIdx) => updItems(group.items.filter((_, i) => i !== sIdx));
    const updateSize = (sIdx, field, val) => {
        const items = [...group.items];
        items[sIdx] = { ...items[sIdx], [field]: val };
        updItems(items);
    };

    const fabrics = group.fabrics || [];
    const updFabs = (fabs) => onUpdate(gIdx, 'fabrics', fabs);
    const addFab = () => updFabs([...fabrics, freshFabric()]);
    const removeFab = (fIdx) => updFabs(fabrics.filter((_, i) => i !== fIdx));
    const updateFab = (fIdx, field, val) => {
        const fabs = [...fabrics];
        fabs[fIdx] = { ...fabs[fIdx], [field]: val };
        updFabs(fabs);
    };

    return (
        <div className="border border-slate-200 rounded-xl overflow-hidden">
            <button onClick={onToggle}
                className="w-full flex items-center gap-2 px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors text-left">
                {expanded
                    ? <ChevronDown size={13} className="text-slate-400 shrink-0" />
                    : <ChevronRight size={13} className="text-slate-400 shrink-0" />}
                <Scissors size={13} className="text-slate-400 shrink-0" />
                <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-slate-700 text-sm">
                        {group.ratio_group_name || <span className="text-slate-400 font-normal italic">Unnamed group</span>}
                    </span>
                    {!expanded && sizeSummary && (
                        <span className="text-xs text-slate-400">{sizeSummary}</span>
                    )}
                </div>
                {!expanded && group.marker_length_inches && (
                    <span className="text-[10px] bg-slate-100 text-slate-500 border border-slate-200 px-2 py-0.5 rounded-full font-bold shrink-0">
                        {group.marker_length_inches}"
                    </span>
                )}
                {!expanded && totalPieces > 0 && (
                    <span className="text-[10px] bg-violet-50 text-violet-600 border border-violet-100 px-2 py-0.5 rounded-full font-bold shrink-0">
                        {totalPieces} pcs
                    </span>
                )}
                {canRemove && (
                    <button onClick={e => { e.stopPropagation(); onRemove(gIdx); }}
                        className="p-1 text-slate-300 hover:text-red-400 transition-colors shrink-0 ml-1">
                        <X size={13} />
                    </button>
                )}
            </button>

            {expanded && (
                <div className="px-4 pb-4 pt-3 border-t border-slate-100 bg-white">
                    <div className="flex gap-3 mb-3">
                        <div className="flex-1">
                            <label className="text-[10px] font-bold text-slate-400 uppercase">Group Name</label>
                            <input type="text" value={group.ratio_group_name}
                                onChange={e => onUpdate(gIdx, 'ratio_group_name', e.target.value)}
                                placeholder="e.g. Main Marker"
                                className="w-full mt-0.5 border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-300"
                            />
                        </div>
                        <div className="w-36 shrink-0">
                            <label className="text-[10px] font-bold text-slate-400 uppercase">Marker Length (in)</label>
                            <input type="number" value={group.marker_length_inches}
                                onChange={e => onUpdate(gIdx, 'marker_length_inches', e.target.value)}
                                placeholder="72"
                                className="w-full mt-0.5 border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-300 text-center"
                            />
                        </div>
                    </div>

                    {/* Size ratio table */}
                    {group.items.length > 0 && (
                        <table className="w-full text-xs mb-2">
                            <thead>
                                <tr className="text-slate-400 font-bold border-b border-slate-100">
                                    <th className="text-left pb-1.5">Size</th>
                                    <th className="text-right pb-1.5 pr-3">Pieces in Marker</th>
                                    <th className="w-7" />
                                </tr>
                            </thead>
                            <tbody>
                                {group.items.map((item, sIdx) => {
                                    const usedNamesExceptThis = new Set(
                                        group.items.filter((_, i) => i !== sIdx).map(it => it.size)
                                    );
                                    return (
                                        <tr key={item._key} className="border-b border-slate-50">
                                            <td className="py-1.5 pr-2">
                                                <select value={item.size}
                                                    onChange={e => updateSize(sIdx, 'size', e.target.value)}
                                                    className="w-20 border border-slate-200 rounded px-2 py-1 text-xs outline-none bg-white text-center"
                                                >
                                                    {item.size && <option value={item.size}>{item.size}</option>}
                                                    {sizes.filter(s => !usedNamesExceptThis.has(s.name) && s.name !== item.size)
                                                        .map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                                                </select>
                                            </td>
                                            <td className="py-1.5 text-right pr-3">
                                                <input type="number" min="1" value={item.number_of_pieces}
                                                    onChange={e => updateSize(sIdx, 'number_of_pieces', parseInt(e.target.value) || 1)}
                                                    className="w-20 border border-slate-200 rounded px-2 py-1 text-xs outline-none text-right"
                                                />
                                            </td>
                                            <td className="py-1.5 text-center">
                                                <button onClick={() => removeSize(sIdx)} className="text-slate-300 hover:text-red-400">
                                                    <X size={12} />
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                    {(() => {
                        const usedNames = new Set(group.items.map(it => it.size).filter(Boolean));
                        const available = sizes.filter(s => !usedNames.has(s.name));
                        return available.length > 0 ? (
                            <select value="" onChange={e => { if (e.target.value) addSize(e.target.value); }}
                                className="mb-4 text-[10px] font-bold text-violet-500 border border-dashed border-violet-300 rounded-lg px-3 py-1 bg-white hover:border-violet-500 hover:text-violet-700 cursor-pointer outline-none transition">
                                <option value="">+ Add size</option>
                                {available.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                            </select>
                        ) : (
                            <p className="mb-4 text-[10px] text-slate-400 italic">
                                {sizes.length === 0 ? 'No sizes configured — add sizes in Admin → Inventory → Manage Sizes.' : 'All available sizes added.'}
                            </p>
                        );
                    })()}

                    {/* Fabric consumptions */}
                    <div className="border-t border-slate-100 pt-3">
                        <div className="flex items-center justify-between mb-2">
                            <p className="text-[10px] font-bold text-slate-400 uppercase">Fabric Consumptions</p>
                            <button onClick={addFab}
                                className="flex items-center gap-1 text-[10px] font-bold text-violet-600 hover:text-violet-700 bg-violet-50 hover:bg-violet-100 px-2 py-1 rounded-md transition-colors">
                                <Plus size={9} /> Add Fabric
                            </button>
                        </div>
                        {fabrics.length === 0 && (
                            <p className="text-xs text-slate-400 italic text-center py-2">No fabrics. Add fabric consumption for this ratio group.</p>
                        )}
                        {fabrics.map((fc, fIdx) => {
                            const ftName = fabricTypes.find(ft => String(ft.id) === String(fc.fabric_type_id))?.name;
                            return (
                                <div key={fc._key} className="flex items-center gap-2 mb-1.5">
                                    <select value={fc.fabric_type_id}
                                        onChange={e => updateFab(fIdx, 'fabric_type_id', e.target.value)}
                                        className="flex-1 border border-slate-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-violet-300 bg-white">
                                        <option value="">— Fabric type —</option>
                                        {fabricTypes.map(ft => <option key={ft.id} value={ft.id}>{ft.name}</option>)}
                                    </select>
                                    <input type="number" min="0" step="0.01" value={fc.consumption_inches}
                                        onChange={e => updateFab(fIdx, 'consumption_inches', e.target.value)}
                                        placeholder="85.5"
                                        className="w-24 border border-slate-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-violet-300 text-right"
                                    />
                                    <span className="text-[10px] text-slate-400 shrink-0">in</span>
                                    <button onClick={() => removeFab(fIdx)} className="text-slate-300 hover:text-red-400 shrink-0">
                                        <X size={12} />
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};

// ─── Quick-create trim modal ──────────────────────────────────────────────────

const UOM_OPTIONS = ['pieces', 'meters', 'spools', 'packets'];

const CreateTrimModal = ({ onClose, onCreated }) => {
    const [name, setName]         = useState('');
    const [brand, setBrand]       = useState('');
    const [itemCode, setItemCode] = useState('');
    const [uom, setUom]           = useState('pieces');
    const [busy, setBusy]         = useState(false);
    const [err, setErr]           = useState(null);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!name.trim() || !brand.trim()) { setErr('Name and brand are required.'); return; }
        setBusy(true); setErr(null);
        try {
            const res = await bomApi.createTrimItem({
                name: name.trim(), brand: brand.trim(),
                item_code: itemCode.trim() || null,
                unit_of_measure: uom,
            });
            onCreated(res.data?.data ?? res.data);
        } catch (ex) {
            setErr(ex?.response?.data?.error || ex.message || 'Failed to create trim item.');
            setBusy(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
                    <p className="font-black text-slate-800 text-sm">New Trim Item</p>
                    <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded-full">
                        <X size={15} className="text-slate-400" />
                    </button>
                </div>
                <form onSubmit={handleSubmit} className="px-5 py-4 space-y-3">
                    {err && (
                        <div className="flex items-center gap-2 bg-red-50 border border-red-100 rounded-lg px-3 py-2 text-xs text-red-600">
                            <AlertCircle size={13} /> {err}
                        </div>
                    )}
                    <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Item Name *</label>
                        <input autoFocus type="text" value={name} onChange={e => setName(e.target.value)}
                            placeholder="e.g. Main Label"
                            className="mt-0.5 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-300"
                        />
                    </div>
                    <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Brand *</label>
                        <input type="text" value={brand} onChange={e => setBrand(e.target.value)}
                            placeholder="e.g. YKK"
                            className="mt-0.5 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-300"
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Item Code</label>
                            <input type="text" value={itemCode} onChange={e => setItemCode(e.target.value)}
                                placeholder="SKU-001"
                                className="mt-0.5 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-300"
                            />
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Unit *</label>
                            <select value={uom} onChange={e => setUom(e.target.value)}
                                className="mt-0.5 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-300 bg-white">
                                {UOM_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
                            </select>
                        </div>
                    </div>
                    <div className="flex justify-end gap-2 pt-1 border-t border-slate-100">
                        <button type="button" onClick={onClose} disabled={busy}
                            className="text-sm font-medium text-slate-500 hover:text-slate-700 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition">
                            Cancel
                        </button>
                        <button type="submit" disabled={busy}
                            className="flex items-center gap-1.5 text-sm font-bold text-white bg-violet-600 hover:bg-violet-700 disabled:opacity-40 px-4 py-1.5 rounded-lg transition">
                            {busy && <Loader2 size={12} className="animate-spin" />}
                            Create Trim
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

// ─── Material Accordion ───────────────────────────────────────────────────────

const MaterialCard = ({ mc, mIdx, trimItems, markerSizes, expanded, onToggle, onUpdate, onRemove, onTrimCreated }) => {
    const trimItem = trimItems.find(t => String(t.id) === String(mc.trim_item_id));
    const uom = trimItem?.unit_of_measure;
    const upd = (field, val) => onUpdate(mIdx, field, val);

    const [createTrimOpen, setCreateTrimOpen] = useState(false);
    const [variantSizes, setVariantSizes] = useState([]);
    useEffect(() => {
        if (!mc.trim_item_id) { setVariantSizes([]); return; }
        bomApi.getTrimVariantSizes(mc.trim_item_id)
            .then(res => setVariantSizes(res.data?.data ?? res.data ?? []))
            .catch(() => setVariantSizes([]));
    }, [mc.trim_item_id]);

    // Sync size_consumptions whenever calculation_type or marker sizes change
    const syncKeyRef = useRef(null);
    useEffect(() => {
        if (mc.calculation_type !== 'PER_SIZE') { syncKeyRef.current = null; return; }
        const key = markerSizes.join(',');
        if (syncKeyRef.current === key) return;
        syncKeyRef.current = key;
        const existingMap = Object.fromEntries(mc.size_consumptions.map(sc => [sc.size, sc]));
        const markerRows = markerSizes.map(s => existingMap[s] ?? { _key: genKey(), size: s, quantity: '', target_variant_size: '' });
        const extraRows  = mc.size_consumptions.filter(sc =>
            !markerSizes.includes(sc.size) && (sc.quantity || sc.target_variant_size)
        );
        onUpdate(mIdx, 'size_consumptions', [...markerRows, ...extraRows]);
    }, [mc.calculation_type, markerSizes]); // eslint-disable-line react-hooks/exhaustive-deps

    const addSize = () => upd('size_consumptions', [...mc.size_consumptions, { _key: genKey(), size: '', quantity: '', target_variant_size: '' }]);
    const removeSize = (sIdx) => upd('size_consumptions', mc.size_consumptions.filter((_, i) => i !== sIdx));
    const updateSize = (sIdx, field, val) => {
        const sc = [...mc.size_consumptions];
        sc[sIdx] = { ...sc[sIdx], [field]: val };
        upd('size_consumptions', sc);
    };

    return (
        <div className="border border-slate-200 rounded-xl overflow-hidden">
            <button onClick={onToggle}
                className="w-full flex items-center gap-2 px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors text-left">
                {expanded
                    ? <ChevronDown size={13} className="text-slate-400 shrink-0" />
                    : <ChevronRight size={13} className="text-slate-400 shrink-0" />}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-bold text-slate-700 text-sm">
                            {trimItem?.name || <span className="text-slate-400 font-normal italic">No item selected</span>}
                        </span>
                        {trimItem?.item_code && (
                            <span className="text-[10px] text-slate-400">· {trimItem.item_code}</span>
                        )}
                        {uom && (
                            <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-100 px-1.5 py-0.5 rounded font-bold">{uom}</span>
                        )}
                    </div>
                    {!expanded && mc.placement_description && (
                        <p className="text-[10px] text-slate-400 mt-0.5 truncate">{mc.placement_description}</p>
                    )}
                </div>
                {!expanded && (
                    <div className="shrink-0 text-right mr-1">
                        {mc.calculation_type === 'FIXED' ? (
                            <span className="text-sm font-bold text-slate-700">{mc.fixed_quantity || '—'}</span>
                        ) : (
                            <span className="text-[10px] text-indigo-600 font-bold">Per Size</span>
                        )}
                    </div>
                )}
                <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-full border shrink-0 ${
                    mc.calculation_type === 'FIXED'
                        ? 'bg-slate-100 text-slate-500 border-slate-200'
                        : 'bg-violet-50 text-violet-600 border-violet-100'
                }`}>{mc.calculation_type}</span>
                <button onClick={e => { e.stopPropagation(); onRemove(mIdx); }}
                    className="p-1 text-slate-300 hover:text-red-400 transition-colors shrink-0 ml-1">
                    <X size={13} />
                </button>
            </button>

            {expanded && (
                <div className="px-4 pb-4 pt-3 border-t border-slate-100 bg-white space-y-3">
                    {createTrimOpen && (
                        <CreateTrimModal
                            onClose={() => setCreateTrimOpen(false)}
                            onCreated={newTrim => { setCreateTrimOpen(false); onTrimCreated(newTrim); }}
                        />
                    )}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase">Trim Item</label>
                            <select
                                value={mc.trim_item_id}
                                onChange={e => {
                                    if (e.target.value === '__create_new__') { setCreateTrimOpen(true); }
                                    else { upd('trim_item_id', e.target.value); }
                                }}
                                className="w-full mt-0.5 border border-slate-200 rounded-lg px-2 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-300 bg-white">
                                <option value="">— Select trim item —</option>
                                <option value="__create_new__">+ Create new trim…</option>
                                {trimItems.map(t => (
                                    <option key={t.id} value={t.id}>
                                        {t.name}{t.item_code ? ` · ${t.item_code}` : ''}{t.unit_of_measure ? ` (${t.unit_of_measure})` : ''}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase">Calculation</label>
                            <select value={mc.calculation_type} onChange={e => upd('calculation_type', e.target.value)}
                                className="w-full mt-0.5 border border-slate-200 rounded-lg px-2 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-300 bg-white">
                                <option value="FIXED">Fixed (same qty all sizes)</option>
                                <option value="PER_SIZE">Per Size (qty varies by size)</option>
                            </select>
                        </div>
                    </div>
                    <div className="flex gap-3">
                        {mc.calculation_type === 'FIXED' && (
                            <div className="w-36 shrink-0">
                                <label className="text-[10px] font-bold text-slate-400 uppercase">
                                    Fixed Qty{uom ? ` (${uom})` : ''}
                                </label>
                                <input type="number" min="0" step="0.0001" value={mc.fixed_quantity}
                                    onChange={e => upd('fixed_quantity', e.target.value)}
                                    placeholder="7"
                                    className="w-full mt-0.5 border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-300"
                                />
                            </div>
                        )}
                        <div className="flex-1">
                            <label className="text-[10px] font-bold text-slate-400 uppercase">Placement</label>
                            <input type="text" value={mc.placement_description}
                                onChange={e => upd('placement_description', e.target.value)}
                                placeholder="e.g. Front placket"
                                className="w-full mt-0.5 border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-300"
                            />
                        </div>
                        <div className="w-24 shrink-0">
                            <label className="text-[10px] font-bold text-slate-400 uppercase">Wastage %</label>
                            <input type="number" min="0" max="100" value={mc.wastage_percentage}
                                onChange={e => upd('wastage_percentage', e.target.value)}
                                placeholder="0"
                                className="w-full mt-0.5 border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-300"
                            />
                        </div>
                    </div>
                    {mc.calculation_type === 'PER_SIZE' && (
                        <div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase mb-1.5">
                                Qty Per Size{uom ? ` (${uom})` : ''}
                            </p>
                            {markerSizes.length > 0 && (() => {
                                const missing = markerSizes.filter(s => {
                                    const row = mc.size_consumptions.find(sc => sc.size === s);
                                    return !row || row.quantity === '' || row.quantity == null;
                                });
                                return missing.length > 0 ? (
                                    <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 mb-2 text-[10px] text-amber-700 font-bold">
                                        <AlertCircle size={11} className="shrink-0" />
                                        Qty required for: {missing.join(', ')}
                                    </div>
                                ) : null;
                            })()}
                            <table className="w-full text-xs mb-2">
                                <thead>
                                    <tr className="text-slate-400 font-bold border-b border-slate-100">
                                        <th className="text-left pb-1">Product Size</th>
                                        <th className="text-left pb-1 px-2">Trim Variant Size</th>
                                        <th className="text-right pb-1 pr-3">Qty{uom ? ` (${uom})` : ''}</th>
                                        <th className="w-6" />
                                    </tr>
                                </thead>
                                <tbody>
                                    {mc.size_consumptions.map((sc, sIdx) => {
                                        const isRequired = markerSizes.includes(sc.size);
                                        const isEmpty    = sc.quantity === '' || sc.quantity == null;
                                        return (
                                        <tr key={sc._key} className="border-b border-slate-50">
                                            <td className="py-1.5 pr-2">
                                                {isRequired ? (
                                                    <span className={`inline-flex items-center justify-center w-14 px-2 py-0.5 text-xs font-bold rounded border ${isEmpty ? 'border-amber-300 bg-amber-50 text-amber-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
                                                        {sc.size}
                                                    </span>
                                                ) : (
                                                    <input type="text" value={sc.size}
                                                        onChange={e => updateSize(sIdx, 'size', e.target.value)}
                                                        placeholder="S"
                                                        className="w-14 border border-slate-200 rounded px-2 py-0.5 text-xs outline-none text-center"
                                                    />
                                                )}
                                            </td>
                                            <td className="py-1.5 px-2">
                                                <select
                                                    value={sc.target_variant_size || ''}
                                                    onChange={e => updateSize(sIdx, 'target_variant_size', e.target.value || null)}
                                                    className="w-full border border-slate-200 rounded px-2 py-0.5 text-xs outline-none focus:ring-1 focus:ring-violet-300 bg-white"
                                                >
                                                    <option value="">— same as product —</option>
                                                    {(variantSizes || []).map(vs => (
                                                        <option key={vs} value={vs}>{vs}</option>
                                                    ))}
                                                </select>
                                            </td>
                                            <td className="py-1.5 text-right pr-3">
                                                <input type="number" min="0" step="0.0001" value={sc.quantity}
                                                    onChange={e => updateSize(sIdx, 'quantity', e.target.value)}
                                                    placeholder="6"
                                                    className={`w-20 border rounded px-2 py-0.5 text-xs outline-none text-right ${isEmpty && isRequired ? 'border-amber-300 focus:ring-amber-300' : 'border-slate-200'}`}
                                                />
                                            </td>
                                            <td className="py-1.5 text-center">
                                                {isRequired ? (
                                                    <span className="w-5 inline-block" title="Required by marker" />
                                                ) : (
                                                    <button onClick={() => removeSize(sIdx)} className="text-slate-300 hover:text-red-400">
                                                        <X size={11} />
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                            <button onClick={addSize} className="text-[10px] font-bold text-violet-500 hover:text-violet-600 flex items-center gap-1">
                                <Plus size={10} /> Add size
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function BomFormPage() {
    const { bomId } = useParams();
    const navigate = useNavigate();
    const isEdit = Boolean(bomId);

    const [initialData] = useState(() => {
        const rg = freshRatioGroup();
        return {
            form: {
                product_id: '', bom_name: '',
                ratio_groups: [rg],
                material_consumptions: [],
            },
            rgKey: rg._key,
        };
    });

    const [form, setForm] = useState(initialData.form);
    const [formMeta, setFormMeta] = useState({ products: [], fabricTypes: [], trimItems: [], sizes: [] });
    const [loading, setLoading] = useState(isEdit);
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState(null);
    const [toast, setToast] = useState(null);
    const [bomStatus, setBomStatus] = useState(null);
    const [rejectionNotes, setRejectionNotes] = useState(null);

    const [expandedRatios, setExpandedRatios] = useState(
        isEdit ? new Set() : new Set([initialData.rgKey])
    );
    const [expandedMaterials, setExpandedMaterials] = useState(new Set());

    const showToast = (msg, ok = true) => {
        setToast({ msg, ok });
        setTimeout(() => setToast(null), 3000);
    };

    useEffect(() => {
        Promise.all([bomApi.getFormData(), accountingApi.getSizes()])
            .then(([formRes, sizesRes]) => {
                const d = formRes.data?.data ?? formRes.data ?? {};
                setFormMeta({
                    products:    d.products    || [],
                    fabricTypes: d.fabricTypes || [],
                    trimItems:   d.trimItems   || [],
                    sizes:       sizesRes.data?.data ?? sizesRes.data ?? [],
                });
            })
            .catch(() => {});
    }, []);

    useEffect(() => {
        if (!isEdit) return;
        bomApi.getById(bomId)
            .then(res => {
                const bom = res.data?.data ?? res.data;
                setBomStatus(bom.status || null);
                setRejectionNotes(bom.rejection_notes || null);
                setForm({
                    product_id: String(bom.product?.id || bom.product_id || ''),
                    bom_name: bom.bom_name || '',
                    ratio_groups: (bom.ratio_groups || []).map(rg => ({
                        _key: genKey(),
                        ratio_group_name: rg.ratio_group_name || '',
                        marker_length_inches: rg.marker_length_inches || '',
                        fabrics: (rg.fabric_consumptions || []).map(fc => ({
                            _key: genKey(),
                            fabric_type_id: String(fc.fabric_type?.id || fc.fabric_type_id || ''),
                            consumption_inches: fc.consumption_inches || '',
                        })),
                        items: (rg.items || []).map(it => ({ _key: genKey(), size: it.size, number_of_pieces: it.number_of_pieces })),
                    })),
                    material_consumptions: (bom.material_consumptions || []).map(mc => ({
                        _key: genKey(),
                        trim_item_id: String(mc.trim_item?.id || mc.trim_item_id || ''),
                        calculation_type: mc.calculation_type || 'FIXED',
                        fixed_quantity: mc.fixed_quantity || '',
                        placement_description: mc.placement_description || '',
                        wastage_percentage: mc.wastage_percentage || '',
                        size_consumptions: (mc.size_consumptions || []).map(sc => ({ _key: genKey(), size: sc.size, quantity: sc.quantity || '', target_variant_size: sc.target_variant_size || '' })),
                    })),
                });
            })
            .catch(e => setErr(e?.response?.data?.error || e.message || 'Failed to load BOM.'))
            .finally(() => setLoading(false));
    }, [bomId, isEdit]);

    // ── Ratio group handlers ──
    const addRatioGroup = () => {
        const ng = freshRatioGroup();
        setForm(f => {
            const existingSizes = new Set();
            f.ratio_groups.forEach(rg => rg.items.forEach(it => { if (it.size) existingSizes.add(it.size); }));
            ng.items = ng.items.filter(it => !existingSizes.has(it.size));
            return { ...f, ratio_groups: [...f.ratio_groups, ng] };
        });
        setExpandedRatios(prev => new Set([...prev, ng._key]));
    };
    const removeRatioGroup = (idx) => {
        const key = form.ratio_groups[idx]._key;
        setForm(f => ({ ...f, ratio_groups: f.ratio_groups.filter((_, i) => i !== idx) }));
        setExpandedRatios(prev => { const s = new Set(prev); s.delete(key); return s; });
    };
    const updateRatioGroup = (idx, field, val) =>
        setForm(f => { const rg = [...f.ratio_groups]; rg[idx] = { ...rg[idx], [field]: val }; return { ...f, ratio_groups: rg }; });
    const toggleRatio = (key) => setExpandedRatios(prev => {
        const s = new Set(prev); s.has(key) ? s.delete(key) : s.add(key); return s;
    });

    // ── Material handlers ──
    const addMaterial = () => {
        const nm = freshMaterial();
        setForm(f => ({ ...f, material_consumptions: [...f.material_consumptions, nm] }));
        setExpandedMaterials(prev => new Set([...prev, nm._key]));
    };
    const removeMaterial = (idx) => {
        const key = form.material_consumptions[idx]._key;
        setForm(f => ({ ...f, material_consumptions: f.material_consumptions.filter((_, i) => i !== idx) }));
        setExpandedMaterials(prev => { const s = new Set(prev); s.delete(key); return s; });
    };
    const updateMaterial = (idx, field, val) =>
        setForm(f => { const mc = [...f.material_consumptions]; mc[idx] = { ...mc[idx], [field]: val }; return { ...f, material_consumptions: mc }; });
    const toggleMaterial = (key) => setExpandedMaterials(prev => {
        const s = new Set(prev); s.has(key) ? s.delete(key) : s.add(key); return s;
    });

    const serialize = () => ({
        product_id: parseInt(form.product_id),
        bom_name: form.bom_name.trim(),
        ratio_groups: form.ratio_groups.map(rg => ({
            ratio_group_name: rg.ratio_group_name.trim(),
            marker_length_inches: rg.marker_length_inches ? parseFloat(rg.marker_length_inches) : null,
            items: rg.items.map(it => ({ size: it.size, number_of_pieces: parseInt(it.number_of_pieces) || 1 })),
            fabric_consumptions: (rg.fabrics || []).map(fc => ({
                fabric_type_id: parseInt(fc.fabric_type_id),
                consumption_inches: parseFloat(fc.consumption_inches) || null,
            })),
        })),
        material_consumptions: form.material_consumptions.map(mc => ({
            trim_item_id: parseInt(mc.trim_item_id),
            calculation_type: mc.calculation_type,
            fixed_quantity: mc.calculation_type === 'FIXED' ? parseFloat(mc.fixed_quantity) : null,
            placement_description: mc.placement_description.trim(),
            wastage_percentage: parseFloat(mc.wastage_percentage) || 0,
            size_consumptions: mc.calculation_type === 'PER_SIZE'
                ? mc.size_consumptions.map(sc => ({
                    size: sc.size,
                    quantity: parseFloat(sc.quantity),
                    target_variant_size: sc.target_variant_size || null,
                }))
                : [],
        })),
    });

    const markerSizes = useMemo(() => {
        const sizes = new Set();
        form.ratio_groups.forEach(rg => rg.items.forEach(it => { if (it.size) sizes.add(it.size); }));
        return [...sizes];
    }, [form.ratio_groups]);

    const handleSave = async () => {
        if (!form.product_id) { setErr('Please select a product.'); return; }
        if (!form.bom_name.trim()) { setErr('BOM name is required.'); return; }
        for (const mc of form.material_consumptions) {
            if (mc.calculation_type !== 'PER_SIZE') continue;
            const missing = markerSizes.filter(s => {
                const row = mc.size_consumptions.find(sc => sc.size === s);
                return !row || row.quantity === '' || row.quantity == null;
            });
            if (missing.length > 0) {
                const name = formMeta.trimItems.find(t => String(t.id) === String(mc.trim_item_id))?.name || 'a material';
                setErr(`"${name}" is missing qty for sizes: ${missing.join(', ')}`);
                return;
            }
        }
        setSaving(true); setErr(null);
        try {
            const payload = serialize();
            if (isEdit) {
                const res = await bomApi.update(bomId, payload);
                const newStatus = res.data?.new_status ?? res.data?.data?.new_status;
                showToast(
                    newStatus === 'PENDING_APPROVAL'
                        ? 'BOM saved — sent back for approval.'
                        : 'BOM updated.'
                );
            } else {
                await bomApi.create(payload);
                showToast('BOM saved as Draft.');
            }
            setTimeout(() => navigate('/merchandiser/bom'), 800);
        } catch (e) {
            setErr(e?.response?.data?.error || e.message || 'Failed to save BOM.');
        } finally {
            setSaving(false);
        }
    };

    if (loading) return (
        <div className="flex items-center justify-center h-64">
            <Loader2 className="animate-spin h-7 w-7 text-violet-500" />
        </div>
    );

    return (
        <div className="min-h-screen bg-slate-50">
            {toast && (
                <div className={`fixed top-4 right-4 z-[60] flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-bold border ${toast.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-600'}`}>
                    {toast.ok ? <Check size={15} /> : <AlertCircle size={15} />} {toast.msg}
                </div>
            )}

            {/* Sticky header */}
            <div className="sticky top-0 z-20 bg-white border-b border-slate-200 shadow-sm">
                <div className="max-w-3xl mx-auto px-6 py-3.5 flex items-center gap-4">
                    <button onClick={() => navigate('/merchandiser/bom')}
                        className="flex items-center gap-1.5 text-sm font-bold text-slate-500 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg transition-colors shrink-0">
                        <ArrowLeft size={14} /> BOMs
                    </button>
                    <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                            {isEdit ? 'Editing BOM' : 'New BOM'}
                        </p>
                        <p className="font-extrabold text-slate-800 text-sm truncate">
                            {form.bom_name || (isEdit ? '…' : 'Create BOM')}
                        </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        {isEdit && (
                            <button onClick={() => navigate(`/merchandiser/bom/${bomId}/measurement-chart`)}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-bold text-violet-600 hover:text-violet-700 border border-violet-200 hover:border-violet-300 hover:bg-violet-50 rounded-lg transition-colors">
                                <Ruler size={13} /> Measurement Chart
                            </button>
                        )}
                        <button onClick={() => navigate('/merchandiser/bom')}
                            className="px-4 py-1.5 text-sm font-bold text-slate-600 hover:text-slate-800 rounded-lg hover:bg-slate-100 transition-colors">
                            Cancel
                        </button>
                        <button onClick={handleSave} disabled={saving}
                            className="flex items-center gap-1.5 px-5 py-1.5 text-sm font-bold bg-violet-600 hover:bg-violet-700 text-white rounded-lg transition-colors disabled:opacity-50">
                            {saving ? <Loader2 size={13} className="animate-spin" /> : <FileText size={13} />}
                            {isEdit ? 'Save Changes' : 'Save as Draft'}
                        </button>
                    </div>
                </div>
            </div>

            {/* Body */}
            <div className="max-w-3xl mx-auto px-6 py-6 space-y-5">
                {bomStatus === 'REJECTED' && rejectionNotes && (
                    <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                        <XCircle size={14} className="text-red-500 shrink-0 mt-0.5" />
                        <div>
                            <p className="text-[10px] font-bold text-red-500 uppercase tracking-wider mb-0.5">Rejection Reason</p>
                            <p className="text-sm text-red-700">{rejectionNotes}</p>
                        </div>
                    </div>
                )}
                {err && (
                    <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-600 text-sm font-medium">
                        <AlertCircle size={15} /> {err}
                    </div>
                )}

                {/* Basic Info */}
                <Section title="Basic Info">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-600 mb-1">
                                Product <span className="text-red-400">*</span>
                            </label>
                            <select value={form.product_id}
                                onChange={e => setForm(f => ({ ...f, product_id: e.target.value }))}
                                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-violet-400 outline-none bg-white">
                                <option value="">— Select product —</option>
                                {formMeta.products.map(p => (
                                    <option key={p.id} value={p.id}>{p.name}{p.brand ? ` · ${p.brand}` : ''}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-600 mb-1">
                                BOM Name <span className="text-red-400">*</span>
                            </label>
                            <input type="text" value={form.bom_name}
                                onChange={e => setForm(f => ({ ...f, bom_name: e.target.value }))}
                                placeholder="e.g. Summer 2026 Production BOM"
                                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-violet-400 outline-none"
                            />
                        </div>
                    </div>
                </Section>

                {/* Ratio Groups */}
                <Section title="Ratio Groups" action={<AddBtn onClick={addRatioGroup} label="Add Group" />}>
                    <div className="space-y-2">
                        {form.ratio_groups.length === 0 && (
                            <p className="text-slate-400 text-sm italic text-center py-4">No ratio groups. Add one to define your marker lay plan.</p>
                        )}
                        {form.ratio_groups.map((group, gIdx) => (
                            <RatioGroupCard key={group._key}
                                group={group} gIdx={gIdx}
                                expanded={expandedRatios.has(group._key)}
                                onToggle={() => toggleRatio(group._key)}
                                onUpdate={updateRatioGroup}
                                onRemove={removeRatioGroup}
                                canRemove={form.ratio_groups.length > 1}
                                fabricTypes={formMeta.fabricTypes}
                                sizes={formMeta.sizes}
                            />
                        ))}
                    </div>
                </Section>

                {/* Material Consumptions */}
                <Section title="Trim / Material Consumptions">
                    <div className="space-y-2">
                        {form.material_consumptions.length === 0 && (
                            <p className="text-slate-400 text-sm italic text-center py-4">No materials added. Add trim items required for this product.</p>
                        )}
                        {form.material_consumptions.map((mc, mIdx) => (
                            <MaterialCard key={mc._key}
                                mc={mc} mIdx={mIdx}
                                trimItems={formMeta.trimItems}
                                markerSizes={markerSizes}
                                expanded={expandedMaterials.has(mc._key)}
                                onToggle={() => toggleMaterial(mc._key)}
                                onUpdate={updateMaterial}
                                onRemove={removeMaterial}
                                onTrimCreated={newTrim => {
                                    setFormMeta(prev => ({ ...prev, trimItems: [...prev.trimItems, newTrim] }));
                                    updateMaterial(mIdx, 'trim_item_id', String(newTrim.id));
                                }}
                            />
                        ))}
                        <AddBtn onClick={addMaterial} label="Add Material" />
                    </div>
                </Section>

                {/* Bottom save */}
                <div className="flex justify-end gap-3 pb-6">
                    <button onClick={() => navigate('/merchandiser/bom')}
                        className="px-5 py-2.5 text-sm font-bold text-slate-600 hover:text-slate-800 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">
                        Cancel
                    </button>
                    <button onClick={handleSave} disabled={saving}
                        className="flex items-center gap-2 px-6 py-2.5 text-sm font-bold bg-violet-600 hover:bg-violet-700 text-white rounded-xl transition-colors disabled:opacity-50 shadow-sm">
                        {saving ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
                        {isEdit ? 'Save Changes' : 'Save as Draft'}
                    </button>
                </div>
            </div>
        </div>
    );
}

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    Plus, FileText, Loader2, X, ChevronDown, ChevronRight,
    AlertCircle, Scissors, ArrowLeft, Check,
} from 'lucide-react';
import { bomApi } from '../../api/bomApi';

const genKey = () => `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

const freshRatioGroup = () => ({
    _key: genKey(), ratio_group_name: '', marker_length_inches: '',
    items: [
        { _key: genKey(), size: 'S', number_of_pieces: 2 },
        { _key: genKey(), size: 'M', number_of_pieces: 3 },
        { _key: genKey(), size: 'L', number_of_pieces: 2 },
    ],
});

const freshFabric = () => ({
    _key: genKey(), fabric_type_id: '', calculation_type: 'AVERAGE',
    average_consumption_inches: '', wastage_percentage: '',
    size_consumptions: [
        { _key: genKey(), size: 'S', consumption_inches: '' },
        { _key: genKey(), size: 'M', consumption_inches: '' },
        { _key: genKey(), size: 'L', consumption_inches: '' },
    ],
});

const freshMaterial = () => ({
    _key: genKey(), trim_item_id: '',
    calculation_type: 'FIXED', fixed_quantity: '',
    placement_description: '', wastage_percentage: '',
    size_consumptions: [
        { _key: genKey(), size: 'S', quantity: '' },
        { _key: genKey(), size: 'M', quantity: '' },
        { _key: genKey(), size: 'L', quantity: '' },
    ],
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

const RatioGroupCard = ({ group, gIdx, expanded, onToggle, onUpdate, onRemove, canRemove }) => {
    const totalPieces = group.items.reduce((s, it) => s + (parseInt(it.number_of_pieces) || 0), 0);
    const sizeSummary = group.items.filter(it => it.size).map(it => `${it.size}×${it.number_of_pieces}`).join(' · ');

    const updItems = (items) => onUpdate(gIdx, 'items', items);
    const addSize = () => updItems([...group.items, { _key: genKey(), size: '', number_of_pieces: 1 }]);
    const removeSize = (sIdx) => updItems(group.items.filter((_, i) => i !== sIdx));
    const updateSize = (sIdx, field, val) => {
        const items = [...group.items];
        items[sIdx] = { ...items[sIdx], [field]: val };
        updItems(items);
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
                    <table className="w-full text-xs mb-2">
                        <thead>
                            <tr className="text-slate-400 font-bold border-b border-slate-100">
                                <th className="text-left pb-1.5">Size</th>
                                <th className="text-right pb-1.5 pr-3">Pieces in Marker</th>
                                <th className="w-7" />
                            </tr>
                        </thead>
                        <tbody>
                            {group.items.map((item, sIdx) => (
                                <tr key={item._key} className="border-b border-slate-50">
                                    <td className="py-1.5 pr-2">
                                        <input type="text" value={item.size}
                                            onChange={e => updateSize(sIdx, 'size', e.target.value)}
                                            placeholder="S"
                                            className="w-16 border border-slate-200 rounded px-2 py-1 text-xs outline-none text-center"
                                        />
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
                            ))}
                        </tbody>
                    </table>
                    <button onClick={addSize} className="text-[10px] font-bold text-violet-500 hover:text-violet-600 flex items-center gap-1">
                        <Plus size={10} /> Add size
                    </button>
                </div>
            )}
        </div>
    );
};

// ─── Fabric Accordion ─────────────────────────────────────────────────────────

const FabricCard = ({ fc, fIdx, fabricTypes, expanded, onToggle, onUpdate, onRemove }) => {
    const ftName = fabricTypes.find(ft => String(ft.id) === String(fc.fabric_type_id))?.name;
    const upd = (field, val) => onUpdate(fIdx, field, val);

    const addSize = () => upd('size_consumptions', [...fc.size_consumptions, { _key: genKey(), size: '', consumption_inches: '' }]);
    const removeSize = (sIdx) => upd('size_consumptions', fc.size_consumptions.filter((_, i) => i !== sIdx));
    const updateSize = (sIdx, field, val) => {
        const sc = [...fc.size_consumptions];
        sc[sIdx] = { ...sc[sIdx], [field]: val };
        upd('size_consumptions', sc);
    };

    const sizeSummary = fc.calculation_type === 'AVERAGE'
        ? (fc.average_consumption_inches ? `${fc.average_consumption_inches}"` : '')
        : fc.size_consumptions.filter(sc => sc.size).map(sc => `${sc.size}: ${sc.consumption_inches}"`).join(' · ');

    return (
        <div className="border border-slate-200 rounded-xl overflow-hidden">
            <button onClick={onToggle}
                className="w-full flex items-center gap-2 px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors text-left">
                {expanded
                    ? <ChevronDown size={13} className="text-slate-400 shrink-0" />
                    : <ChevronRight size={13} className="text-slate-400 shrink-0" />}
                <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-slate-700 text-sm">
                        {ftName || <span className="text-slate-400 font-normal italic">No fabric selected</span>}
                    </span>
                    {!expanded && sizeSummary && (
                        <span className="text-xs text-slate-400">{sizeSummary}</span>
                    )}
                </div>
                <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-full border shrink-0 ${
                    fc.calculation_type === 'AVERAGE'
                        ? 'bg-sky-50 text-sky-600 border-sky-100'
                        : 'bg-indigo-50 text-indigo-600 border-indigo-100'
                }`}>{fc.calculation_type}</span>
                {!expanded && parseFloat(fc.wastage_percentage) > 0 && (
                    <span className="text-[10px] text-slate-400 shrink-0">{fc.wastage_percentage}% wastage</span>
                )}
                <button onClick={e => { e.stopPropagation(); onRemove(fIdx); }}
                    className="p-1 text-slate-300 hover:text-red-400 transition-colors shrink-0 ml-1">
                    <X size={13} />
                </button>
            </button>

            {expanded && (
                <div className="px-4 pb-4 pt-3 border-t border-slate-100 bg-white space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase">Fabric Type</label>
                            <select value={fc.fabric_type_id} onChange={e => upd('fabric_type_id', e.target.value)}
                                className="w-full mt-0.5 border border-slate-200 rounded-lg px-2 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-300 bg-white">
                                <option value="">— Select —</option>
                                {fabricTypes.map(ft => <option key={ft.id} value={ft.id}>{ft.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase">Calculation</label>
                            <select value={fc.calculation_type} onChange={e => upd('calculation_type', e.target.value)}
                                className="w-full mt-0.5 border border-slate-200 rounded-lg px-2 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-300 bg-white">
                                <option value="AVERAGE">Average (single value)</option>
                                <option value="PER_SIZE">Per Size</option>
                            </select>
                        </div>
                    </div>
                    <div className="flex gap-3">
                        {fc.calculation_type === 'AVERAGE' && (
                            <div className="flex-1">
                                <label className="text-[10px] font-bold text-slate-400 uppercase">Avg Consumption (inches)</label>
                                <input type="number" value={fc.average_consumption_inches}
                                    onChange={e => upd('average_consumption_inches', e.target.value)}
                                    placeholder="85.5"
                                    className="w-full mt-0.5 border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-300"
                                />
                            </div>
                        )}
                        <div className="w-28 shrink-0">
                            <label className="text-[10px] font-bold text-slate-400 uppercase">Wastage %</label>
                            <input type="number" min="0" max="100" value={fc.wastage_percentage}
                                onChange={e => upd('wastage_percentage', e.target.value)}
                                placeholder="3.5"
                                className="w-full mt-0.5 border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-300"
                            />
                        </div>
                    </div>
                    {fc.calculation_type === 'PER_SIZE' && (
                        <div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase mb-1.5">Per-Size Consumption (inches)</p>
                            <table className="w-full text-xs mb-2">
                                <thead>
                                    <tr className="text-slate-400 font-bold border-b border-slate-100">
                                        <th className="text-left pb-1">Size</th>
                                        <th className="text-right pb-1 pr-3">Inches</th>
                                        <th className="w-6" />
                                    </tr>
                                </thead>
                                <tbody>
                                    {fc.size_consumptions.map((sc, sIdx) => (
                                        <tr key={sc._key} className="border-b border-slate-50">
                                            <td className="py-1.5 pr-2">
                                                <input type="text" value={sc.size}
                                                    onChange={e => updateSize(sIdx, 'size', e.target.value)}
                                                    placeholder="S"
                                                    className="w-14 border border-slate-200 rounded px-2 py-0.5 text-xs outline-none text-center"
                                                />
                                            </td>
                                            <td className="py-1.5 text-right pr-3">
                                                <input type="number" value={sc.consumption_inches}
                                                    onChange={e => updateSize(sIdx, 'consumption_inches', e.target.value)}
                                                    placeholder="75"
                                                    className="w-20 border border-slate-200 rounded px-2 py-0.5 text-xs outline-none text-right"
                                                />
                                            </td>
                                            <td className="py-1.5 text-center">
                                                <button onClick={() => removeSize(sIdx)} className="text-slate-300 hover:text-red-400">
                                                    <X size={11} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
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

// ─── Material Accordion ───────────────────────────────────────────────────────

const MaterialCard = ({ mc, mIdx, trimItems, expanded, onToggle, onUpdate, onRemove }) => {
    const trimItem = trimItems.find(t => String(t.id) === String(mc.trim_item_id));
    const uom = trimItem?.unit_of_measure;
    const upd = (field, val) => onUpdate(mIdx, field, val);

    const addSize = () => upd('size_consumptions', [...mc.size_consumptions, { _key: genKey(), size: '', quantity: '' }]);
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
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase">Trim Item</label>
                            <select value={mc.trim_item_id} onChange={e => upd('trim_item_id', e.target.value)}
                                className="w-full mt-0.5 border border-slate-200 rounded-lg px-2 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-300 bg-white">
                                <option value="">— Select trim item —</option>
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
                            <table className="w-full text-xs mb-2">
                                <thead>
                                    <tr className="text-slate-400 font-bold border-b border-slate-100">
                                        <th className="text-left pb-1">Size</th>
                                        <th className="text-right pb-1 pr-3">Qty{uom ? ` (${uom})` : ''}</th>
                                        <th className="w-6" />
                                    </tr>
                                </thead>
                                <tbody>
                                    {mc.size_consumptions.map((sc, sIdx) => (
                                        <tr key={sc._key} className="border-b border-slate-50">
                                            <td className="py-1.5 pr-2">
                                                <input type="text" value={sc.size}
                                                    onChange={e => updateSize(sIdx, 'size', e.target.value)}
                                                    placeholder="S"
                                                    className="w-14 border border-slate-200 rounded px-2 py-0.5 text-xs outline-none text-center"
                                                />
                                            </td>
                                            <td className="py-1.5 text-right pr-3">
                                                <input type="number" min="0" step="0.0001" value={sc.quantity}
                                                    onChange={e => updateSize(sIdx, 'quantity', e.target.value)}
                                                    placeholder="6"
                                                    className="w-20 border border-slate-200 rounded px-2 py-0.5 text-xs outline-none text-right"
                                                />
                                            </td>
                                            <td className="py-1.5 text-center">
                                                <button onClick={() => removeSize(sIdx)} className="text-slate-300 hover:text-red-400">
                                                    <X size={11} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
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
        const fab = freshFabric();
        return {
            form: {
                product_id: '', bom_name: '',
                ratio_groups: [rg],
                fabric_consumptions: [fab],
                material_consumptions: [],
            },
            rgKey: rg._key,
            fabKey: fab._key,
        };
    });

    const [form, setForm] = useState(initialData.form);
    const [formMeta, setFormMeta] = useState({ products: [], fabricTypes: [], trimItems: [] });
    const [loading, setLoading] = useState(isEdit);
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState(null);
    const [toast, setToast] = useState(null);

    const [expandedRatios, setExpandedRatios] = useState(
        isEdit ? new Set() : new Set([initialData.rgKey])
    );
    const [expandedFabrics, setExpandedFabrics] = useState(
        isEdit ? new Set() : new Set([initialData.fabKey])
    );
    const [expandedMaterials, setExpandedMaterials] = useState(new Set());

    const showToast = (msg, ok = true) => {
        setToast({ msg, ok });
        setTimeout(() => setToast(null), 3000);
    };

    useEffect(() => {
        bomApi.getFormData()
            .then(res => {
                const d = res.data?.data ?? res.data ?? {};
                setFormMeta({
                    products:    d.products    || [],
                    fabricTypes: d.fabricTypes || [],
                    trimItems:   d.trimItems   || [],
                });
            })
            .catch(() => {});
    }, []);

    useEffect(() => {
        if (!isEdit) return;
        bomApi.getById(bomId)
            .then(res => {
                const bom = res.data?.data ?? res.data;
                setForm({
                    product_id: String(bom.product?.id || bom.product_id || ''),
                    bom_name: bom.bom_name || '',
                    ratio_groups: (bom.ratio_groups || []).map(rg => ({
                        _key: genKey(),
                        ratio_group_name: rg.ratio_group_name || '',
                        marker_length_inches: rg.marker_length_inches || '',
                        items: (rg.items || []).map(it => ({ _key: genKey(), size: it.size, number_of_pieces: it.number_of_pieces })),
                    })),
                    fabric_consumptions: (bom.fabric_consumptions || []).map(fc => ({
                        _key: genKey(),
                        fabric_type_id: String(fc.fabric_type?.id || fc.fabric_type_id || ''),
                        calculation_type: fc.calculation_type || 'AVERAGE',
                        average_consumption_inches: fc.average_consumption_inches || '',
                        wastage_percentage: fc.wastage_percentage || '',
                        size_consumptions: (fc.size_consumptions || []).map(sc => ({ _key: genKey(), size: sc.size, consumption_inches: sc.consumption_inches })),
                    })),
                    material_consumptions: (bom.material_consumptions || []).map(mc => ({
                        _key: genKey(),
                        trim_item_id: String(mc.trim_item?.id || mc.trim_item_id || ''),
                        calculation_type: mc.calculation_type || 'FIXED',
                        fixed_quantity: mc.fixed_quantity || '',
                        placement_description: mc.placement_description || '',
                        wastage_percentage: mc.wastage_percentage || '',
                        size_consumptions: (mc.size_consumptions || []).map(sc => ({ _key: genKey(), size: sc.size, quantity: sc.quantity || '' })),
                    })),
                });
            })
            .catch(e => setErr(e?.response?.data?.error || e.message || 'Failed to load BOM.'))
            .finally(() => setLoading(false));
    }, [bomId, isEdit]);

    // ── Ratio group handlers ──
    const addRatioGroup = () => {
        const ng = freshRatioGroup();
        setForm(f => ({ ...f, ratio_groups: [...f.ratio_groups, ng] }));
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

    // ── Fabric handlers ──
    const addFabric = () => {
        const nf = freshFabric();
        setForm(f => ({ ...f, fabric_consumptions: [...f.fabric_consumptions, nf] }));
        setExpandedFabrics(prev => new Set([...prev, nf._key]));
    };
    const removeFabric = (idx) => {
        const key = form.fabric_consumptions[idx]._key;
        setForm(f => ({ ...f, fabric_consumptions: f.fabric_consumptions.filter((_, i) => i !== idx) }));
        setExpandedFabrics(prev => { const s = new Set(prev); s.delete(key); return s; });
    };
    const updateFabric = (idx, field, val) =>
        setForm(f => { const fc = [...f.fabric_consumptions]; fc[idx] = { ...fc[idx], [field]: val }; return { ...f, fabric_consumptions: fc }; });
    const toggleFabric = (key) => setExpandedFabrics(prev => {
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
        })),
        fabric_consumptions: form.fabric_consumptions.map(fc => ({
            fabric_type_id: parseInt(fc.fabric_type_id),
            calculation_type: fc.calculation_type,
            average_consumption_inches: fc.calculation_type === 'AVERAGE' ? parseFloat(fc.average_consumption_inches) : null,
            wastage_percentage: parseFloat(fc.wastage_percentage) || 0,
            size_consumptions: fc.calculation_type === 'PER_SIZE'
                ? fc.size_consumptions.map(sc => ({ size: sc.size, consumption_inches: parseFloat(sc.consumption_inches) }))
                : [],
        })),
        material_consumptions: form.material_consumptions.map(mc => ({
            trim_item_id: parseInt(mc.trim_item_id),
            calculation_type: mc.calculation_type,
            fixed_quantity: mc.calculation_type === 'FIXED' ? parseFloat(mc.fixed_quantity) : null,
            placement_description: mc.placement_description.trim(),
            wastage_percentage: parseFloat(mc.wastage_percentage) || 0,
            size_consumptions: mc.calculation_type === 'PER_SIZE'
                ? mc.size_consumptions.map(sc => ({ size: sc.size, quantity: parseFloat(sc.quantity) }))
                : [],
        })),
    });

    const handleSave = async () => {
        if (!form.product_id) { setErr('Please select a product.'); return; }
        if (!form.bom_name.trim()) { setErr('BOM name is required.'); return; }
        setSaving(true); setErr(null);
        try {
            const payload = serialize();
            if (isEdit) {
                await bomApi.update(bomId, payload);
            } else {
                await bomApi.create(payload);
            }
            showToast(isEdit ? 'BOM updated.' : 'BOM saved as Draft.');
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
                            />
                        ))}
                    </div>
                </Section>

                {/* Fabric Consumptions */}
                <Section title="Fabric Consumptions" action={<AddBtn onClick={addFabric} label="Add Fabric" />}>
                    <div className="space-y-2">
                        {form.fabric_consumptions.length === 0 && (
                            <p className="text-slate-400 text-sm italic text-center py-4">No fabrics added yet.</p>
                        )}
                        {form.fabric_consumptions.map((fc, fIdx) => (
                            <FabricCard key={fc._key}
                                fc={fc} fIdx={fIdx}
                                fabricTypes={formMeta.fabricTypes}
                                expanded={expandedFabrics.has(fc._key)}
                                onToggle={() => toggleFabric(fc._key)}
                                onUpdate={updateFabric}
                                onRemove={removeFabric}
                            />
                        ))}
                    </div>
                </Section>

                {/* Material Consumptions */}
                <Section title="Trim / Material Consumptions" action={<AddBtn onClick={addMaterial} label="Add Material" />}>
                    <div className="space-y-2">
                        {form.material_consumptions.length === 0 && (
                            <p className="text-slate-400 text-sm italic text-center py-4">No materials added. Add trim items required for this product.</p>
                        )}
                        {form.material_consumptions.map((mc, mIdx) => (
                            <MaterialCard key={mc._key}
                                mc={mc} mIdx={mIdx}
                                trimItems={formMeta.trimItems}
                                expanded={expandedMaterials.has(mc._key)}
                                onToggle={() => toggleMaterial(mc._key)}
                                onUpdate={updateMaterial}
                                onRemove={removeMaterial}
                            />
                        ))}
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

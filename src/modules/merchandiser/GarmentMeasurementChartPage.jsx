import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    ArrowLeft, Plus, Trash2, Loader2, AlertCircle, Check,
    Ruler, X, ChevronDown,
} from 'lucide-react';
import { bomApi } from '../../api/bomApi';

// ─── constants ─────────────────────────────────────────────────────────────────

const genKey = () => `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

const STEP_OPTIONS = [
    { label: '⅛', value: 0.125 },
    { label: '¼', value: 0.25 },
    { label: '½', value: 0.5 },
    { label: '1',  value: 1.0 },
];

const SIZE_ORDER = ['XXXS','XXS','XS','S','M','L','XL','XXL','XXXL','3XL','4XL','5XL','6XL'];

const sortSizes = (sizes) => [...new Set(sizes)].sort((a, b) => {
    const na = parseFloat(a), nb = parseFloat(b);
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    const ia = SIZE_ORDER.findIndex(s => s === a.toUpperCase());
    const ib = SIZE_ORDER.findIndex(s => s === b.toUpperCase());
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return a.localeCompare(b);
});

const FRACS = { 1:'⅛', 2:'¼', 3:'⅜', 4:'½', 5:'⅝', 6:'¾', 7:'⅞' };

const fmtGrading = (v) => {
    const n = Math.round(Number(v) * 8) / 8;
    if (!n) return '0';
    const sign = n > 0 ? '+' : '−';
    const abs = Math.abs(n);
    const whole = Math.floor(abs);
    const rem = Math.round((abs - whole) * 8);
    const frac = FRACS[rem] || (rem ? `${rem}/8` : '');
    if (!whole && !frac) return '0';
    if (!whole) return `${sign}${frac}`;
    if (!frac) return `${sign}${whole}`;
    return `${sign}${whole} ${frac}`;
};

const freshPoint = (order) => ({
    _key: genKey(),
    point_name: '',
    unit: 'cm',
    base_value: '',
    tolerance: '',
    display_order: order,
    gradings: {},
});

// ─── grading stepper ───────────────────────────────────────────────────────────

const GradingCell = ({ grading, step, baseValue, onChange }) => {
    const val = Math.round(Number(grading || 0) * 8) / 8;
    const base = Number(baseValue) || 0;
    const computed = Math.round((base + val) * 1000) / 1000;

    return (
        <div className="flex flex-col items-center gap-0.5 select-none py-1.5 px-1">
            <div className="flex items-center gap-0.5">
                <button
                    onClick={() => onChange(Math.round((val - step) * 1000) / 1000)}
                    className="w-[18px] h-[18px] flex items-center justify-center rounded bg-slate-100 hover:bg-red-100 hover:text-red-600 text-slate-500 font-bold text-xs transition-colors leading-none"
                >−</button>
                <span className={`w-10 text-center text-[11px] font-bold font-mono tabular-nums ${
                    val > 0 ? 'text-emerald-700' : val < 0 ? 'text-red-600' : 'text-slate-300'
                }`}>
                    {fmtGrading(val)}
                </span>
                <button
                    onClick={() => onChange(Math.round((val + step) * 1000) / 1000)}
                    className="w-[18px] h-[18px] flex items-center justify-center rounded bg-slate-100 hover:bg-emerald-100 hover:text-emerald-700 text-slate-500 font-bold text-xs transition-colors leading-none"
                >+</button>
            </div>
            <span className="text-[9px] text-slate-400 font-mono tabular-nums font-medium">
                {Number.isFinite(computed) ? computed.toFixed(2) : '—'}
            </span>
        </div>
    );
};

// ─── main page ─────────────────────────────────────────────────────────────────

export default function GarmentMeasurementChartPage() {
    const { bomId } = useParams();
    const navigate  = useNavigate();

    const [bomName,     setBomName]     = useState('');
    const [markerSizes, setMarkerSizes] = useState([]);
    const [customSizes, setCustomSizes] = useState([]);
    const [chart,       setChart]       = useState(null);
    const [step,        setStep]        = useState(0.25);
    const [loading,     setLoading]     = useState(true);
    const [saving,      setSaving]      = useState(false);
    const [err,         setErr]         = useState(null);
    const [toast,       setToast]       = useState(null);
    const [newSizeVal,  setNewSizeVal]  = useState('');
    const [addingSize,  setAddingSize]  = useState(false);
    const addSizeRef = useRef(null);

    // ── load ──
    useEffect(() => {
        Promise.all([
            bomApi.getById(bomId),
            bomApi.getMeasurementChart(bomId).catch(() => ({ data: null })),
        ]).then(([bomRes, chartRes]) => {
            const bom = bomRes.data?.data ?? bomRes.data;
            setBomName(bom?.bom_name || '');

            const mSizes = new Set();
            (bom?.ratio_groups || []).forEach(rg =>
                (rg.items || []).forEach(it => { if (it.size) mSizes.add(it.size); })
            );
            setMarkerSizes([...mSizes]);

            const data = chartRes?.data?.data ?? chartRes?.data;
            if (data?.points?.length) {
                setChart({
                    base_size: data.base_size || '',
                    notes:     data.notes     || '',
                    points: data.points.map(p => ({
                        _key:          genKey(),
                        point_name:    p.point_name    || '',
                        unit:          p.unit          || 'cm',
                        base_value:    p.base_value    ?? '',
                        tolerance:     p.tolerance     ?? '',
                        display_order: p.display_order ?? 0,
                        gradings:      { ...(p.gradings || {}) },
                    })),
                });
                const chartSizesFromGradings = new Set(
                    data.points.flatMap(p => Object.keys(p.gradings || {}))
                );
                if (data.base_size) chartSizesFromGradings.add(data.base_size);
                setCustomSizes([...chartSizesFromGradings].filter(s => !mSizes.has(s)));
            } else {
                setChart({ base_size: '', notes: '', points: [] });
            }
        }).catch(e => setErr(e?.response?.data?.error || e.message || 'Failed to load'))
          .finally(() => setLoading(false));
    }, [bomId]);

    useEffect(() => {
        if (addingSize && addSizeRef.current) addSizeRef.current.focus();
    }, [addingSize]);

    // ── computed sizes ──
    const allSizes = useMemo(
        () => sortSizes([...markerSizes, ...customSizes]),
        [markerSizes, customSizes]
    );

    const orderedCols = useMemo(() => {
        if (!chart?.base_size) return allSizes;
        return [chart.base_size, ...allSizes.filter(s => s !== chart.base_size)];
    }, [allSizes, chart?.base_size]);

    // ── point handlers ──
    const addPoint = () =>
        setChart(c => ({ ...c, points: [...c.points, freshPoint(c.points.length)] }));

    const removePoint = (idx) =>
        setChart(c => ({ ...c, points: c.points.filter((_, i) => i !== idx) }));

    const updatePoint = (idx, field, val) =>
        setChart(c => {
            const pts = [...c.points];
            pts[idx] = { ...pts[idx], [field]: val };
            return { ...c, points: pts };
        });

    const updateGrading = (pIdx, size, val) =>
        setChart(c => {
            const pts = [...c.points];
            const g = { ...pts[pIdx].gradings };
            if (!val) { delete g[size]; } else { g[size] = val; }
            pts[pIdx] = { ...pts[pIdx], gradings: g };
            return { ...c, points: pts };
        });

    // ── custom size handlers ──
    const commitAddSize = () => {
        const s = newSizeVal.trim();
        if (s && !allSizes.map(x => x.toLowerCase()).includes(s.toLowerCase())) {
            setCustomSizes(prev => [...prev, s]);
        }
        setNewSizeVal(''); setAddingSize(false);
    };

    const removeCustomSize = (size) => {
        setCustomSizes(prev => prev.filter(s => s !== size));
        setChart(c => ({
            ...c,
            points: c.points.map(p => {
                const g = { ...p.gradings };
                delete g[size];
                return { ...p, gradings: g };
            }),
        }));
    };

    // ── save ──
    const handleSave = async () => {
        if (!chart.base_size) { setErr('Please select a base size.'); return; }
        setSaving(true); setErr(null);
        try {
            const payload = {
                base_size: chart.base_size,
                notes:     chart.notes?.trim() || null,
                points: chart.points.map((p, i) => ({
                    point_name:    p.point_name.trim(),
                    unit:          p.unit,
                    base_value:    parseFloat(p.base_value) || 0,
                    tolerance:     p.tolerance !== '' && p.tolerance != null ? parseFloat(p.tolerance) : null,
                    display_order: i,
                    gradings: Object.fromEntries(
                        Object.entries(p.gradings)
                            .filter(([s, v]) => s !== chart.base_size && v !== 0)
                            .map(([s, v]) => [s, Number(v)])
                    ),
                })),
            };
            await bomApi.saveMeasurementChart(bomId, payload);
            setToast({ msg: 'Measurement chart saved.', ok: true });
            setTimeout(() => setToast(null), 3000);
        } catch (e) {
            setErr(e?.response?.data?.error || e.message || 'Failed to save.');
        } finally {
            setSaving(false);
        }
    };

    // ─────────────────────────────────────────────────────────────────────────

    if (loading) return (
        <div className="flex items-center justify-center h-full min-h-[50vh]">
            <Loader2 className="animate-spin w-8 h-8 text-violet-500" />
        </div>
    );

    // sticky col left offsets (px): # 36 | Point 200 | Unit 60 | Tol 72
    const L = { num: 0, point: 36, unit: 236, tol: 296 };
    const stickyBase = 'sticky z-10 bg-white';
    const stickyHd   = 'sticky z-20 bg-slate-50';

    return (
        <div className="flex flex-col h-full bg-slate-50">
            {/* toast */}
            {toast && (
                <div className={`fixed top-4 right-4 z-[70] flex items-center gap-2 px-4 py-3 rounded-xl shadow-xl text-sm font-bold border ${toast.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-600'}`}>
                    {toast.ok ? <Check size={15} /> : <AlertCircle size={15} />} {toast.msg}
                </div>
            )}

            {/* ── sticky page header ── */}
            <div className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-30 shrink-0">
                {/* row 1: nav + controls */}
                <div className="flex items-center gap-3 px-5 py-3 flex-wrap gap-y-2">
                    <button
                        onClick={() => navigate(`/merchandiser/bom/${bomId}/edit`)}
                        className="flex items-center gap-1.5 text-sm font-bold text-slate-500 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg transition-colors shrink-0">
                        <ArrowLeft size={14} /> BOM
                    </button>

                    <div className="flex items-center gap-2 min-w-0 flex-1">
                        <Ruler size={15} className="text-violet-500 shrink-0" />
                        <div className="min-w-0">
                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider leading-none">Garment Measurement Chart</p>
                            <p className="font-extrabold text-slate-800 text-sm leading-tight truncate">{bomName}</p>
                        </div>
                    </div>

                    {/* base size */}
                    <div className="flex items-center gap-1.5 shrink-0">
                        <label className="text-[10px] font-bold text-slate-400 uppercase whitespace-nowrap">Base Size</label>
                        <select
                            value={chart?.base_size || ''}
                            onChange={e => setChart(c => ({ ...c, base_size: e.target.value }))}
                            className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-violet-300 bg-white"
                        >
                            <option value="">— select —</option>
                            {allSizes.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                    </div>

                    {/* grading step */}
                    <div className="flex items-center gap-1 shrink-0">
                        <span className="text-[10px] font-bold text-slate-400 uppercase mr-0.5">Step</span>
                        <div className="flex items-center bg-slate-100 rounded-lg p-0.5 gap-0.5">
                            {STEP_OPTIONS.map(o => (
                                <button key={o.value} onClick={() => setStep(o.value)}
                                    className={`px-2.5 py-1 text-xs font-bold rounded-md transition-all ${step === o.value ? 'bg-white text-violet-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                                    {o.label}"
                                </button>
                            ))}
                        </div>
                    </div>

                    <button onClick={handleSave} disabled={saving}
                        className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-bold bg-violet-600 hover:bg-violet-700 text-white rounded-lg transition-colors disabled:opacity-50 shrink-0">
                        {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                        Save Chart
                    </button>
                </div>

                {/* row 2: notes */}
                <div className="flex items-center gap-2 px-5 py-2 border-t border-slate-100 bg-slate-50/80">
                    <span className="text-[10px] font-bold text-slate-400 uppercase shrink-0">Notes</span>
                    <input
                        type="text"
                        value={chart?.notes || ''}
                        onChange={e => setChart(c => ({ ...c, notes: e.target.value }))}
                        placeholder="e.g. Summer 2026 grading"
                        className="flex-1 border border-slate-200 rounded-lg px-3 py-1 text-xs outline-none focus:ring-2 focus:ring-violet-300 bg-white"
                    />
                </div>
            </div>

            {/* error */}
            {err && (
                <div className="mx-5 mt-4 flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-600 text-sm font-medium shrink-0">
                    <AlertCircle size={15} className="shrink-0" /> {err}
                    <button onClick={() => setErr(null)} className="ml-auto text-red-400 hover:text-red-600"><X size={14} /></button>
                </div>
            )}

            {/* ── table ── */}
            <div className="flex-1 overflow-auto p-5">
                <table className="border-separate border-spacing-0 text-sm">
                    {/* thead */}
                    <thead>
                        <tr>
                            {/* # */}
                            <th style={{ left: L.num, width: 36 }}
                                className={`${stickyHd} border-b-2 border-r border-slate-200 text-center text-[10px] font-black text-slate-400 uppercase px-2 py-2.5 rounded-tl-lg`}>
                                #
                            </th>
                            {/* Point Name */}
                            <th style={{ left: L.point, minWidth: 200 }}
                                className={`${stickyHd} border-b-2 border-r border-slate-200 text-left text-[10px] font-black text-slate-400 uppercase px-3 py-2.5 whitespace-nowrap`}>
                                Measurement Point
                            </th>
                            {/* Unit */}
                            <th style={{ left: L.unit, width: 60 }}
                                className={`${stickyHd} border-b-2 border-r border-slate-200 text-center text-[10px] font-black text-slate-400 uppercase px-2 py-2.5`}>
                                Unit
                            </th>
                            {/* Tolerance */}
                            <th style={{ left: L.tol, width: 72 }}
                                className={`${stickyHd} border-b-2 border-r border-slate-200 text-center text-[10px] font-black text-slate-400 uppercase px-2 py-2.5`}>
                                ± Tol
                            </th>

                            {/* size columns */}
                            {orderedCols.map(size => {
                                const isBase   = size === chart?.base_size;
                                const isMarker = markerSizes.includes(size);
                                return (
                                    <th key={size} style={{ minWidth: 88 }}
                                        className={`border-b-2 border-r border-slate-200 text-center px-1 py-2 ${isBase ? 'bg-violet-50' : 'bg-slate-50'}`}>
                                        <div className="flex flex-col items-center gap-0.5">
                                            <span className={`text-xs font-black ${isBase ? 'text-violet-700' : 'text-slate-600'}`}>{size}</span>
                                            {isBase && (
                                                <span className="text-[8px] bg-violet-600 text-white px-1.5 py-0.5 rounded font-black tracking-wide">BASE</span>
                                            )}
                                            {!isMarker && !isBase && (
                                                <button onClick={() => removeCustomSize(size)}
                                                    className="text-slate-300 hover:text-red-400 transition-colors" title="Remove size column">
                                                    <X size={9} />
                                                </button>
                                            )}
                                            {!isMarker && isBase && (
                                                <span className="text-[8px] text-violet-400">custom</span>
                                            )}
                                        </div>
                                    </th>
                                );
                            })}

                            {/* add size column */}
                            <th style={{ minWidth: 72 }}
                                className="border-b-2 border-slate-200 bg-slate-50 text-center px-2 py-2">
                                {addingSize ? (
                                    <div className="flex items-center gap-0.5 justify-center">
                                        <input
                                            ref={addSizeRef}
                                            value={newSizeVal}
                                            onChange={e => setNewSizeVal(e.target.value)}
                                            onKeyDown={e => { if (e.key === 'Enter') commitAddSize(); if (e.key === 'Escape') { setAddingSize(false); setNewSizeVal(''); } }}
                                            placeholder="40"
                                            className="w-10 border border-violet-300 rounded px-1 py-0.5 text-xs font-bold outline-none text-center focus:ring-1 focus:ring-violet-400"
                                        />
                                        <button onClick={commitAddSize} className="text-emerald-600 hover:text-emerald-700">
                                            <Check size={11} />
                                        </button>
                                        <button onClick={() => { setAddingSize(false); setNewSizeVal(''); }} className="text-slate-400 hover:text-slate-600">
                                            <X size={11} />
                                        </button>
                                    </div>
                                ) : (
                                    <button onClick={() => setAddingSize(true)}
                                        className="flex items-center gap-0.5 text-[10px] font-bold text-violet-500 hover:text-violet-700 transition-colors mx-auto">
                                        <Plus size={10} /> Size
                                    </button>
                                )}
                            </th>

                            {/* delete col */}
                            <th style={{ width: 36 }} className="border-b-2 border-slate-200 bg-slate-50 rounded-tr-lg" />
                        </tr>
                    </thead>

                    {/* tbody */}
                    <tbody>
                        {(!chart?.points || chart.points.length === 0) && (
                            <tr>
                                <td colSpan={5 + orderedCols.length + 2}
                                    className="text-center py-16 text-slate-400 text-sm italic border-b border-slate-100">
                                    No measurement points yet — add one below.
                                </td>
                            </tr>
                        )}

                        {chart?.points.map((pt, pIdx) => (
                            <tr key={pt._key} className="group">
                                {/* # */}
                                <td style={{ left: L.num }}
                                    className={`${stickyBase} group-hover:bg-slate-50 border-b border-r border-slate-100 text-center text-[10px] text-slate-400 font-bold px-2 py-1.5`}>
                                    {pIdx + 1}
                                </td>
                                {/* Point Name */}
                                <td style={{ left: L.point }}
                                    className={`${stickyBase} group-hover:bg-slate-50 border-b border-r border-slate-100 px-3 py-1`}>
                                    <input
                                        type="text"
                                        value={pt.point_name}
                                        onChange={e => updatePoint(pIdx, 'point_name', e.target.value)}
                                        placeholder="e.g. ½ Chest"
                                        className="w-full min-w-[180px] bg-transparent border-0 outline-none text-sm font-medium text-slate-700 placeholder:text-slate-300"
                                    />
                                </td>
                                {/* Unit */}
                                <td style={{ left: L.unit }}
                                    className={`${stickyBase} group-hover:bg-slate-50 border-b border-r border-slate-100 text-center px-2 py-1`}>
                                    <select
                                        value={pt.unit}
                                        onChange={e => updatePoint(pIdx, 'unit', e.target.value)}
                                        className="text-xs font-bold text-slate-600 bg-transparent border-0 outline-none cursor-pointer text-center appearance-none"
                                    >
                                        <option value="cm">cm</option>
                                        <option value="in">in</option>
                                    </select>
                                </td>
                                {/* Tolerance */}
                                <td style={{ left: L.tol }}
                                    className={`${stickyBase} group-hover:bg-slate-50 border-b border-r border-slate-100 text-center px-1.5 py-1`}>
                                    <input
                                        type="number"
                                        value={pt.tolerance}
                                        onChange={e => updatePoint(pIdx, 'tolerance', e.target.value)}
                                        placeholder="0.5"
                                        step="0.125"
                                        min="0"
                                        className="w-14 text-xs text-center border border-slate-200 rounded px-1 py-0.5 outline-none focus:ring-1 focus:ring-violet-300"
                                    />
                                </td>

                                {/* size cells */}
                                {orderedCols.map(size => {
                                    const isBase = size === chart.base_size;
                                    return (
                                        <td key={size}
                                            className={`border-b border-r border-slate-100 text-center px-0.5 py-0 ${isBase ? 'bg-violet-50/60' : ''}`}>
                                            {isBase ? (
                                                <div className="flex flex-col items-center gap-0.5 py-1.5 px-1">
                                                    <input
                                                        type="number"
                                                        value={pt.base_value}
                                                        onChange={e => updatePoint(pIdx, 'base_value', e.target.value)}
                                                        placeholder="45.0"
                                                        step="0.125"
                                                        min="0"
                                                        className="w-16 text-center text-sm font-bold text-violet-800 border border-violet-200 bg-white rounded-lg px-1 py-0.5 outline-none focus:ring-2 focus:ring-violet-400"
                                                    />
                                                    <span className="text-[9px] text-violet-400 font-bold">{pt.unit}</span>
                                                </div>
                                            ) : (
                                                <GradingCell
                                                    grading={pt.gradings[size] ?? 0}
                                                    step={step}
                                                    baseValue={pt.base_value}
                                                    onChange={(val) => updateGrading(pIdx, size, val)}
                                                />
                                            )}
                                        </td>
                                    );
                                })}

                                {/* placeholder under add-size header */}
                                <td className="border-b border-slate-100" />

                                {/* delete */}
                                <td className="border-b border-slate-100 text-center px-1 py-1">
                                    <button onClick={() => removePoint(pIdx)}
                                        className="text-slate-200 hover:text-red-500 transition-colors p-1 rounded hover:bg-red-50"
                                        title="Remove row">
                                        <Trash2 size={12} />
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>

                    {/* tfoot: add row */}
                    <tfoot>
                        <tr>
                            <td colSpan={5 + orderedCols.length + 2} className="pt-3 pb-2 pl-2">
                                <button onClick={addPoint}
                                    className="flex items-center gap-1.5 text-xs font-bold text-violet-600 hover:text-violet-700 bg-violet-50 hover:bg-violet-100 px-3 py-2 rounded-lg transition-colors">
                                    <Plus size={12} /> Add Measurement Point
                                </button>
                            </td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>
    );
}

// One style: Details / Sizes / Parts / Route tabs, each saved on its own.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowUp, ArrowDown, Trash2, Plus, CheckCircle2 } from 'lucide-react';
import { stylesApi } from '../api/stylesApi';
import { apiError } from '../api/mastersApi';
import { Field, inputCls, PrimaryButton, SecondaryButton, ErrorBox, ActiveBadge, Loading } from '../components/ui';
import { UNIT_LABEL, SCOPE_LABEL } from './StageTypesPage';
import StyleBomsTab from '../boms/StyleBomsTab';

const TABS = [
    { key: 'details', label: 'Details' },
    { key: 'sizes', label: 'Sizes' },
    { key: 'parts', label: 'Parts' },
    { key: 'route', label: 'Route' },
    { key: 'boms', label: 'BOMs' },
];

const move = (arr, i, d) => {
    const j = i + d;
    if (j < 0 || j >= arr.length) return arr;
    const next = [...arr];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
};

// Parts a stage handles, by its part scope.
const inScope = (part, scope) => scope === 'ALL' || (scope === 'MAIN_ONLY' ? part.part_type === 'MAIN' : part.part_type === 'SUPPORTING');

export default function StyleDetailPage() {
    const { id } = useParams();
    const [style, setStyle] = useState(null);
    const [canEdit, setCanEdit] = useState(false);
    const [canEditBom, setCanEditBom] = useState(false);
    const [masterSizes, setMasterSizes] = useState([]);
    const [stageTypes, setStageTypes] = useState([]);
    const [tab, setTab] = useState('details');
    const [error, setError] = useState('');

    // Per-tab working copies.
    const [details, setDetails] = useState(null);
    const [sizeIds, setSizeIds] = useState([]);
    const [parts, setParts] = useState([]);
    const [route, setRoute] = useState([]);
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState(null);

    const apply = useCallback((s) => {
        setStyle(s);
        setDetails({ style_code: s.style_code, name: s.name, buyer: s.buyer || '', product_type: s.product_type || '', is_active: s.is_active });
        setSizeIds(s.sizes.map(x => String(x.size_id)));
        setParts(s.parts.map(p => ({ ...p, id: String(p.id) })));
        setRoute(s.route.map(r => ({ stage_type_id: String(r.stage_type_id), skipped_part_ids: r.skipped_part_ids.map(String) })));
    }, []);

    useEffect(() => {
        Promise.all([stylesApi.style(id), stylesApi.sizes(), stylesApi.stageTypes()])
            .then(([s, sz, st]) => { apply(s.data); setMasterSizes(sz.data); setStageTypes(st.data); })
            .catch(err => setError(apiError(err, 'Failed to load the style.')));
        stylesApi.permissions().then(res => { setCanEdit(res.data.styles); setCanEditBom(res.data.bomEdit); }).catch(() => {});
    }, [id, apply]);

    const stageById = useMemo(() => new Map(stageTypes.map(t => [String(t.id), t])), [stageTypes]);
    const savedParts = style?.parts || [];

    const dirty = style && {
        details: JSON.stringify(details) !== JSON.stringify({ style_code: style.style_code, name: style.name, buyer: style.buyer || '', product_type: style.product_type || '', is_active: style.is_active }),
        sizes: JSON.stringify(sizeIds) !== JSON.stringify(style.sizes.map(x => String(x.size_id))),
        parts: JSON.stringify(parts.map(p => [p.id || null, p.part_name, p.part_type, p.is_active])) !== JSON.stringify(style.parts.map(p => [String(p.id), p.part_name, p.part_type, p.is_active])),
        route: JSON.stringify(route) !== JSON.stringify(style.route.map(r => ({ stage_type_id: String(r.stage_type_id), skipped_part_ids: r.skipped_part_ids.map(String) }))),
    };

    const save = async (which) => {
        setSaving(true); setMsg(null);
        try {
            let res;
            if (which === 'details') res = await stylesApi.updateStyle(id, details);
            if (which === 'sizes') res = await stylesApi.setSizes(id, sizeIds);
            if (which === 'parts') res = await stylesApi.setParts(id, parts.map(p => ({ id: p.id || undefined, part_name: p.part_name, part_type: p.part_type, is_active: p.is_active })));
            if (which === 'route') res = await stylesApi.setRoute(id, route);
            apply(res.data);
            setMsg({ ok: true, text: 'Saved.' });
        } catch (err) {
            setMsg({ ok: false, text: apiError(err, 'Failed to save.') });
        } finally {
            setSaving(false);
        }
    };

    if (!style) return <div>{error ? <ErrorBox text={error} /> : <Loading />}</div>;

    const SaveBar = ({ which }) => canEdit && (
        <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-slate-100 mt-4">
            <PrimaryButton onClick={() => save(which)} busy={saving} disabled={saving || !dirty[which]}>Save {TABS.find(t => t.key === which).label.toLowerCase()}</PrimaryButton>
            {dirty[which] && <SecondaryButton onClick={() => apply(style)}>Discard changes</SecondaryButton>}
            {dirty[which] && <span className="text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">Unsaved changes</span>}
            {msg && !dirty[which] && <span className={`text-xs font-semibold flex items-center gap-1 ${msg.ok ? 'text-emerald-600' : 'text-rose-600'}`}>{msg.ok && <CheckCircle2 size={13} />} {msg.text}</span>}
            {msg && !msg.ok && dirty[which] && <span className="text-xs font-semibold text-rose-600">{msg.text}</span>}
        </div>
    );

    const sizesInMasterOrder = (ids) => masterSizes.filter(s => ids.includes(String(s.id))).map(s => String(s.id));

    return (
        <div>
            <Link to="/v3/styles" className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-indigo-600 mb-3"><ArrowLeft size={15} /> Styles</Link>
            <div className="flex flex-wrap items-center gap-3 mb-4">
                <h1 className="text-2xl font-black text-slate-900">{style.style_code}</h1>
                <span className="text-slate-500">{style.name}</span>
                <ActiveBadge active={style.is_active} />
            </div>

            <div className="flex gap-1 border-b border-slate-200 mb-4 overflow-x-auto">
                {TABS.map(t => (
                    <button key={t.key} type="button" onClick={() => { setTab(t.key); setMsg(null); }}
                        className={`px-4 py-2 text-sm font-bold border-b-2 -mb-px whitespace-nowrap ${tab === t.key ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
                        {t.label}{dirty[t.key] ? ' •' : ''}
                    </button>
                ))}
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4">
                {tab === 'details' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl">
                        <Field label="Style code *"><input className={inputCls} disabled={!canEdit} value={details.style_code} onChange={e => setDetails({ ...details, style_code: e.target.value })} /></Field>
                        <Field label="Style name *"><input className={inputCls} disabled={!canEdit} value={details.name} onChange={e => setDetails({ ...details, name: e.target.value })} /></Field>
                        <Field label="Buyer"><input className={inputCls} disabled={!canEdit} value={details.buyer} onChange={e => setDetails({ ...details, buyer: e.target.value })} /></Field>
                        <Field label="Product type"><input className={inputCls} disabled={!canEdit} value={details.product_type} onChange={e => setDetails({ ...details, product_type: e.target.value })} /></Field>
                        <label className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={!canEdit} checked={details.is_active} onChange={e => setDetails({ ...details, is_active: e.target.checked })} /> Active</label>
                    </div>
                )}

                {tab === 'sizes' && (
                    <div>
                        <p className="text-sm text-slate-500 mb-3">Tap the sizes this style is made in. They follow the sizes master's order.</p>
                        <div className="flex flex-wrap gap-2">
                            {masterSizes.map(s => {
                                const on = sizeIds.includes(String(s.id));
                                return (
                                    <button key={s.id} type="button" disabled={!canEdit}
                                        onClick={() => setSizeIds(prev => sizesInMasterOrder(on ? prev.filter(x => x !== String(s.id)) : [...prev, String(s.id)]))}
                                        className={`min-w-[52px] px-3 py-2 rounded-lg border-2 text-sm font-black transition ${on ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-200 text-slate-600 hover:border-indigo-300'}`}>
                                        {s.name}
                                    </button>
                                );
                            })}
                        </div>
                        <p className="text-xs text-slate-400 mt-3">{sizeIds.length} size{sizeIds.length !== 1 ? 's' : ''} selected.</p>
                    </div>
                )}

                {tab === 'parts' && (
                    <div>
                        <p className="text-sm text-slate-500 mb-3">Pattern parts cut for this style. Main parts are the body (FRONT, BACK …); supporting parts are pocketing, facings and similar.</p>
                        <div className="space-y-2 max-w-2xl">
                            {parts.length === 0 && <p className="text-sm text-slate-400">No parts yet.</p>}
                            {parts.map((p, i) => (
                                <div key={p.id || `new-${i}`} className="flex items-center gap-2">
                                    <input className={inputCls} disabled={!canEdit} placeholder="Part name, e.g. FRONT" value={p.part_name}
                                        onChange={e => setParts(ps => ps.map((x, j) => j === i ? { ...x, part_name: e.target.value } : x))} />
                                    <select className={`${inputCls} w-40`} disabled={!canEdit} value={p.part_type}
                                        onChange={e => setParts(ps => ps.map((x, j) => j === i ? { ...x, part_type: e.target.value } : x))}>
                                        <option value="MAIN">Main</option><option value="SUPPORTING">Supporting</option>
                                    </select>
                                    <label className="flex items-center gap-1 text-xs text-slate-600 whitespace-nowrap"><input type="checkbox" disabled={!canEdit} checked={p.is_active} onChange={e => setParts(ps => ps.map((x, j) => j === i ? { ...x, is_active: e.target.checked } : x))} /> active</label>
                                    {canEdit && <>
                                        <button type="button" onClick={() => setParts(ps => move(ps, i, -1))} className="p-1.5 rounded text-slate-500 hover:bg-slate-100" aria-label="Move up"><ArrowUp size={15} /></button>
                                        <button type="button" onClick={() => setParts(ps => move(ps, i, 1))} className="p-1.5 rounded text-slate-500 hover:bg-slate-100" aria-label="Move down"><ArrowDown size={15} /></button>
                                        <button type="button" onClick={() => setParts(ps => ps.filter((_, j) => j !== i))} className="p-1.5 rounded text-rose-500 hover:bg-rose-50" aria-label="Remove part"><Trash2 size={15} /></button>
                                    </>}
                                </div>
                            ))}
                        </div>
                        {canEdit && <button type="button" onClick={() => setParts(ps => [...ps, { part_name: '', part_type: 'MAIN', is_active: true }])} className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-indigo-600"><Plus size={14} /> Add part</button>}
                    </div>
                )}

                {tab === 'route' && (
                    <div>
                        <p className="text-sm text-slate-500 mb-1">The stages this style goes through, in order. Tap a part under a stage to mark it <b>skipped</b> there (e.g. BELT at BF sewing).</p>
                        {dirty.parts && <p className="text-xs font-bold text-amber-700 mb-2">Save the Parts tab first. Skips use the saved parts.</p>}
                        {canEdit && route.length === 0 && (
                            <SecondaryButton onClick={() => setRoute(stageTypes.filter(t => t.is_active).map(t => ({ stage_type_id: String(t.id), skipped_part_ids: [] })))}>
                                Use standard route (all active stages)
                            </SecondaryButton>
                        )}
                        <div className="space-y-2 mt-3 max-w-3xl">
                            {route.map((r, i) => {
                                const st = stageById.get(r.stage_type_id);
                                const handled = savedParts.filter(p => p.is_active && st && inScope(p, st.part_scope));
                                return (
                                    <div key={r.stage_type_id} className="border border-slate-200 rounded-lg p-3">
                                        <div className="flex items-center gap-2">
                                            <span className="w-7 h-7 rounded-full bg-indigo-50 text-indigo-700 text-xs font-black flex items-center justify-center">{i + 1}</span>
                                            <span className="font-bold text-slate-800">{st?.name || 'Unknown stage'}</span>
                                            {st && <span className="text-xs text-slate-500">{UNIT_LABEL[st.unit]} · {SCOPE_LABEL[st.part_scope]}</span>}
                                            {canEdit && <span className="ml-auto flex">
                                                <button type="button" onClick={() => setRoute(rs => move(rs, i, -1))} className="p-1.5 rounded text-slate-500 hover:bg-slate-100" aria-label="Move up"><ArrowUp size={15} /></button>
                                                <button type="button" onClick={() => setRoute(rs => move(rs, i, 1))} className="p-1.5 rounded text-slate-500 hover:bg-slate-100" aria-label="Move down"><ArrowDown size={15} /></button>
                                                <button type="button" onClick={() => setRoute(rs => rs.filter((_, j) => j !== i))} className="p-1.5 rounded text-rose-500 hover:bg-rose-50" aria-label="Remove stage"><Trash2 size={15} /></button>
                                            </span>}
                                        </div>
                                        {handled.length > 0 && (
                                            <div className="flex flex-wrap gap-1.5 mt-2 pl-9">
                                                {handled.map(p => {
                                                    const skipped = r.skipped_part_ids.includes(String(p.id));
                                                    return (
                                                        <button key={p.id} type="button" disabled={!canEdit}
                                                            onClick={() => setRoute(rs => rs.map((x, j) => j !== i ? x : {
                                                                ...x, skipped_part_ids: skipped ? x.skipped_part_ids.filter(s => s !== String(p.id)) : [...x.skipped_part_ids, String(p.id)],
                                                            }))}
                                                            className={`text-xs font-bold px-2 py-1 rounded-md border ${skipped ? 'bg-slate-100 border-slate-300 text-slate-400 line-through' : 'bg-emerald-50 border-emerald-200 text-emerald-700'}`}>
                                                            {p.part_name}{skipped ? ' · skipped' : ''}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                        {canEdit && (() => {
                            const free = stageTypes.filter(t => t.is_active && !route.some(r => r.stage_type_id === String(t.id)));
                            return free.length > 0 && (
                                <select className={`${inputCls} w-64 mt-3`} value="" onChange={e => e.target.value && setRoute(rs => [...rs, { stage_type_id: e.target.value, skipped_part_ids: [] }])} aria-label="Add a stage">
                                    <option value="">+ Add a stage…</option>
                                    {free.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                </select>
                            );
                        })()}
                    </div>
                )}

                {tab === 'boms' && <StyleBomsTab styleId={id} canEdit={canEditBom} />}

                {tab !== 'boms' && <SaveBar which={tab} />}
            </div>
        </div>
    );
}

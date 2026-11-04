// Fabric stock: rolls per fabric item (roll no., dye lot, width, current
// metres / kg). On hand = the item's rolls in stock; planning allocates from
// it. Opening roll count (paste from Excel), per-roll adjustments and history.
// 4 Nov 2026: filters, totals per unit, search by roll / lot / location, who holds the fabric and each roll, rolls grouped by lot;
// Excel / PDF of what the filter and search show (fabricStockExport.js). Phase 2: adjust by the quantity counted, with a fixed
// reason; correct location, dye lot and width (logged); count sheet.
import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronRight, Plus, History, SlidersHorizontal, Trash2, FileSpreadsheet, FileText, Pencil, ClipboardList } from 'lucide-react';
import Modal from '../../shared/Modal';
import { mastersApi, apiError } from '../api/mastersApi';
import { PageHeader, SearchInput, Field, inputCls, PrimaryButton, SecondaryButton, ErrorBox, Loading, fmtQty, useMastersPermissions } from '../components/ui';
import LocationList from '../components/LocationList';
import { useV3Access } from '../V3Access';
import { keyForPath } from '../v3Nav';
import { loadLetterhead } from '../components/letterhead';
import { naturally, fmtDate, ageDays, rollFrom, perUnit, exportFabricStockExcel, exportFabricStockPdf, exportFabricCountSheet } from './fabricStockExport';

const blankRow = () => ({ roll_no: '', dye_lot: '', qty: '', width: '', location: '' });
const KIND = { OPENING: 'Opening count', GRN: 'Received (GRN)', ISSUE: 'Issued', RETURN: 'Returned', ADJUSTMENT: 'Adjustment', SUPPLIER_RETURN: 'Returned to supplier', DETAILS: 'Details corrected' };
const REASONS = [['RECOUNT', 'Recount'], ['DAMAGE', 'Damage'], ['SAMPLE', 'Sample / lab test'], ['ENTRY_ERROR', 'Wrong entry'], ['OTHER', 'Other']];
const SLIP_PATH = { GRN: '/v3/purchasing/grns/', MATERIAL_ISSUE: '/v3/material-issue/issues/', MATERIAL_RETURN: '/v3/material-returns/', RETURN_NOTE: '/v3/purchasing/return-notes/' };
const ROLL_STATUS = { FINISHED: 'finished', RETURNED: 'returned to supplier' };
const FILTERS = [
    { key: 'STOCK', label: 'In stock', test: r => r.on_hand > 0 || r.free < 0 },   // over-allocated stays in view even with no rolls
    { key: 'FREE', label: 'Free stock', test: r => r.free > 0 },
    { key: 'FULL', label: 'Fully allocated', test: r => r.allocated > 0 && r.free <= 0 },
    { key: 'MISSING', label: 'Missing data', test: r => r.rolls_missing_data > 0 },
    { key: 'ALL', label: 'All', test: () => true },
];
const ROLL_LIMIT = 2000;   // the API's most rolls per answer

// The rolls of one fabric, by dye lot.
function RollsPanel({ item, rolls, loadError, onRetry, finishedShown, onToggleFinished, canAdjust, onAdjust, canCorrect, onCorrect, onHistory, orderLink }) {
    if (loadError) return <div className="py-1"><ErrorBox text={loadError} /><button type="button" className="mt-1 text-xs font-semibold text-indigo-700" onClick={onRetry}>Try again</button></div>;
    if (!rolls) return <Loading />;
    const matched = new Set((item.matched_roll_ids || []).map(String));
    const finishedCount = rolls.filter(x => x.status !== 'IN_STOCK').length;
    const visible = rolls.filter(x => x.status === 'IN_STOCK' || finishedShown || matched.has(String(x.id))).sort((a, b) => naturally(a.roll_no, b.roll_no));
    const lots = new Map();
    for (const x of visible) { const k = x.dye_lot || ''; if (!lots.has(k)) lots.set(k, []); lots.get(k).push(x); }
    const groups = [...lots.entries()].sort(([a], [b]) => (a ? 0 : 1) - (b ? 0 : 1) || naturally(a, b));
    const onRolls = rolls.filter(x => x.status === 'IN_STOCK' && x.held_by.length).reduce((s, x) => s + x.qty, 0);
    const byMetres = Math.round((item.allocated - onRolls) * 1000) / 1000;
    const sum = (list, f) => list.reduce((s, x) => s + (Number(x[f]) || 0), 0);
    return (
        <div>
            <p className="text-xs text-slate-600 py-1"><b>Held by:</b> {item.held_by.length === 0 ? 'no order' : item.held_by.map((h, i) => <Fragment key={h.order_id}>{i > 0 && ' · '}{orderLink(h)} {fmtQty(h.qty)} {item.uom}</Fragment>)}</p>
            {byMetres > 0 && <p className="text-xs text-slate-500 pb-1">{fmtQty(byMetres)} {item.uom} is allocated as a quantity, not to particular rolls, so the rolls below don't show it.</p>}
            <table className="w-full text-xs">
                <thead className="text-slate-500 text-right"><tr><th className="text-left py-1">Roll</th><th>Width</th><th>Now</th><th>Received qty</th><th>Received on</th><th>Age</th><th className="text-left pl-4">Location</th><th className="text-left">From</th><th className="text-left">Held by</th><th className="w-44" /></tr></thead>
                <tbody>
                    {groups.map(([lot, list]) => (
                        <Fragment key={lot}>
                            <tr className="border-t border-slate-300 bg-slate-100/70"><td colSpan={10} className="py-1 px-1 font-bold text-slate-700">{lot ? `Lot ${lot}` : 'Lot not recorded'} · {list.length} roll{list.length === 1 ? '' : 's'} · {fmtQty(sum(list, 'qty'))} {item.uom}</td></tr>
                            {list.map(x => (
                                <tr key={x.id} className={`border-t border-slate-200 text-right tabular-nums ${x.status !== 'IN_STOCK' ? 'text-slate-400' : ''} ${matched.has(String(x.id)) ? 'bg-amber-50' : ''}`}>
                                    <td className="text-left py-1 font-semibold">{x.roll_no}{ROLL_STATUS[x.status] && <span className="ml-1 text-[10px]">{ROLL_STATUS[x.status]}</span>}</td>
                                    <td>{x.width ? `${x.width} ${x.width_unit}` : '—'}</td>
                                    <td className="font-bold">{fmtQty(x.qty)} {x.uom}</td>
                                    <td>{fmtQty(x.original_qty)}</td>
                                    <td>{fmtDate(x.created_at)}</td>
                                    <td>{x.status === 'IN_STOCK' ? `${ageDays(x.created_at)} d` : '—'}</td>
                                    <td className="text-left pl-4">{x.location || '—'}</td>
                                    <td className="text-left">{rollFrom(x)}</td>
                                    <td className="text-left">{x.held_by.length ? x.held_by.map((h, i) => <Fragment key={h.order_id}>{i > 0 && ', '}{orderLink(h)}</Fragment>) : '—'}</td>
                                    <td className="text-right whitespace-nowrap">
                                        {canAdjust && x.status === 'IN_STOCK' && <button type="button" className="mr-2 inline-flex items-center gap-0.5 font-semibold text-indigo-700" onClick={() => onAdjust(x)}><SlidersHorizontal size={11} /> Adjust</button>}
                                        {canCorrect && x.status === 'IN_STOCK' && <button type="button" className="mr-2 inline-flex items-center gap-0.5 font-semibold text-indigo-700" onClick={() => onCorrect(x)}><Pencil size={11} /> Details</button>}
                                        <button type="button" className="inline-flex items-center gap-0.5 font-semibold text-slate-600" onClick={() => onHistory(x)}><History size={11} /> History</button>
                                    </td>
                                </tr>
                            ))}
                        </Fragment>
                    ))}
                    {visible.length === 0 && <tr><td colSpan={10} className="py-2 text-slate-400">No rolls in stock.</td></tr>}
                </tbody>
                {visible.length > 0 && <tfoot><tr className="border-t-2 border-slate-300 text-right tabular-nums font-bold text-slate-700"><td className="text-left py-1">Total · {visible.length} roll{visible.length === 1 ? '' : 's'}</td><td /><td>{fmtQty(sum(visible, 'qty'))} {item.uom}</td><td>{fmtQty(sum(visible, 'original_qty'))}</td><td colSpan={6} /></tr></tfoot>}
            </table>
            {finishedCount > 0 && <button type="button" className="mt-1 text-xs font-semibold text-indigo-700" onClick={onToggleFinished}>{finishedShown ? 'Hide' : 'Show'} {finishedCount} finished / returned roll{finishedCount === 1 ? '' : 's'}</button>}
        </div>
    );
}

export default function FabricStockPage() {
    const perms = useMastersPermissions();
    const me = useV3Access()?.me;
    const canOpen = (path) => me?.menu?.[keyForPath(path)] !== false;
    const [rows, setRows] = useState(null);
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState('STOCK');
    const [open, setOpen] = useState(new Set());
    const [rolls, setRolls] = useState({});            // itemId → rolls
    const [rollsError, setRollsError] = useState({});  // itemId → message
    const [finishedShown, setFinishedShown] = useState(new Set());   // itemIds showing their finished rolls
    const [error, setError] = useState('');
    const [opening, setOpening] = useState(null);      // { itemId, rows, note, paste }
    const [adjust, setAdjust] = useState(null);        // { roll, item, counted, code, note }
    const [details, setDetails] = useState(null);      // { roll, location, dye_lot, width, width_unit, reason }
    const [ledger, setLedger] = useState(null);        // { roll, rows }
    const [items, setItems] = useState([]);
    const [busy, setBusy] = useState(false);
    const [formError, setFormError] = useState('');
    const [exporting, setExporting] = useState('');    // 'excel' | 'pdf' | 'count'

    const loadRolls = useCallback((itemId) => {
        setRollsError(prev => ({ ...prev, [itemId]: '' }));
        return mastersApi.fabricRolls({ fabric_item_id: itemId })
            .then(res => setRolls(prev => ({ ...prev, [itemId]: res.data })))
            .catch(err => setRollsError(prev => ({ ...prev, [itemId]: apiError(err, 'Failed to load the rolls.') })));
    }, []);

    const loadSeq = useRef(0);          // a slow answer to an older search must not replace a newer one
    const autoOpened = useRef('');      // the search whose roll hits were last opened
    const load = useCallback(() => {
        const seq = ++loadSeq.current;
        const q = search.trim();
        return mastersApi.fabricStock({ q: q || undefined }).then(res => {
            if (seq !== loadSeq.current) return;
            setRows(res.data); setError('');
            if (q && autoOpened.current !== q) {   // a search that hit rolls opens those fabrics (not when it hit many)
                autoOpened.current = q;
                const hits = res.data.filter(r => r.matched_roll_ids.length).map(r => String(r.id));
                if (hits.length && hits.length <= 5) { setOpen(prev => new Set([...prev, ...hits])); hits.forEach(loadRolls); }
            }
        }).catch(err => { if (seq === loadSeq.current) setError(apiError(err, 'Failed to load fabric stock.')); });
    }, [search, loadRolls]);
    useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

    const toggle = (id) => {
        const nx = new Set(open);
        if (nx.has(id)) nx.delete(id); else { nx.add(id); loadRolls(id); }
        setOpen(nx);
    };
    const refresh = (itemId) => { load(); if (itemId) loadRolls(itemId); };

    const openOpening = () => {
        setFormError('');
        mastersApi.fabricItems().then(res => setItems(res.data.filter(i => i.is_active))).catch(() => {});
        setOpening({ itemId: '', rows: [blankRow()], note: '', paste: '' });
    };
    // Paste rows copied from Excel: roll no. ⇥ dye lot ⇥ qty ⇥ width ⇥ location
    const applyPaste = () => {
        const parsed = opening.paste.replace(/\r/g, '').split('\n').map(l => l.split('\t')).filter(c => c[0]?.trim())
            .map(c => ({ roll_no: c[0]?.trim() || '', dye_lot: c[1]?.trim() || '', qty: (c[2] || '').replace(/[^\d.-]/g, ''), width: (c[3] || '').replace(/[^\d.]/g, ''), location: c[4]?.trim() || '' }));
        if (parsed.length) setOpening({ ...opening, rows: [...opening.rows.filter(r => r.roll_no || r.qty), ...parsed], paste: '' });
    };
    const setRow = (i, patch) => setOpening({ ...opening, rows: opening.rows.map((r, j) => (j === i ? { ...r, ...patch } : r)) });
    const saveOpening = async () => {
        setBusy(true); setFormError('');
        try {
            const list = opening.rows.filter(r => r.roll_no || r.qty).map(r => ({ ...r, fabric_item_id: opening.itemId, qty: Number(r.qty), width: r.width ? Number(r.width) : null }));
            await mastersApi.postOpeningRolls(list, opening.note);
            const itemId = opening.itemId;
            setOpening(null); refresh(itemId);
        } catch (err) { setFormError(apiError(err, 'Failed to save.')); } finally { setBusy(false); }
    };
    const saveAdjust = async () => {
        setBusy(true); setFormError('');
        try {
            await mastersApi.adjustRoll(adjust.roll.id, { counted_qty: Number(adjust.counted), reason_code: adjust.code, note: adjust.note });
            const itemId = adjust.roll.fabric_item_id;
            setAdjust(null); refresh(String(itemId));
        } catch (err) { setFormError(apiError(err, 'Failed to save.')); } finally { setBusy(false); }
    };
    // Only the fields changed go to the API, so a store user's save never touches the lot or width.
    const detailChanges = () => {
        if (!details) return {};
        const { roll } = details;
        const out = {};
        if (details.location.trim() !== (roll.location || '')) out.location = details.location;
        if (details.dye_lot.trim() !== (roll.dye_lot || '')) out.dye_lot = details.dye_lot;
        if (Number(details.width || 0) !== Number(roll.width || 0) || (roll.width && details.width_unit !== roll.width_unit)) { out.width = details.width; out.width_unit = details.width_unit; }
        return out;
    };
    const saveDetails = async () => {
        setBusy(true); setFormError('');
        try {
            await mastersApi.correctRoll(details.roll.id, { ...detailChanges(), reason: details.reason });
            const itemId = details.roll.fabric_item_id;
            setDetails(null); refresh(String(itemId));
        } catch (err) { setFormError(apiError(err, 'Failed to save.')); } finally { setBusy(false); }
    };
    const showLedger = (roll) => mastersApi.rollLedger(roll.id).then(res => { setError(''); setLedger({ roll, rows: res.data }); }).catch(err => setError(apiError(err, 'Failed to load history.')));
    const toggleFinished = (id) => setFinishedShown(prev => { const nx = new Set(prev); if (nx.has(id)) nx.delete(id); else nx.add(id); return nx; });
    const orderLink = (h) => {
        const to = `/v3/planning/orders/${h.order_id}`;
        return canOpen(to) ? <Link to={to} className="font-semibold text-indigo-700 hover:underline">{h.order_no}</Link> : <span className="font-semibold">{h.order_no}</span>;
    };

    const openingTotal = opening ? opening.rows.reduce((s, r) => s + (Number(r.qty) || 0), 0) : 0;
    const openingUnit = opening ? items.find(i => String(i.id) === String(opening.itemId))?.usage_uom || '' : '';
    const adjustDiff = adjust && adjust.counted !== '' ? Math.round((Number(adjust.counted) - adjust.roll.qty) * 1000) / 1000 : null;
    const changed = detailChanges();
    const needsReason = 'dye_lot' in changed || 'width' in changed;
    const active = FILTERS.find(f => f.key === filter);
    const shown = rows ? rows.filter(active.test) : [];
    const otherHits = rows && search.trim() && filter !== 'ALL' ? rows.length - shown.length : 0;
    // What the filter and search show now, with those fabrics' rolls in stock. Never a cut-off list: refused if the API's limit is reached.
    const exportStock = async (format) => {
        setExporting(format); setError('');
        try {
            const { data: all } = await mastersApi.fabricRolls({ status: 'IN_STOCK' });
            if (all.length >= ROLL_LIMIT) { setError(`More than ${ROLL_LIMIT.toLocaleString('en-IN')} rolls in stock: too many to export at once. Tell the system admin.`); return; }
            const ids = new Set(shown.map(r => String(r.id)));
            const data = { fabrics: shown, rolls: all.filter(x => ids.has(String(x.fabric_item_id))), filter: active.label, search: search.trim(), by: me?.user?.name };
            if (format === 'excel') await exportFabricStockExcel(data);
            else if (format === 'count') await exportFabricCountSheet(data);
            else exportFabricStockPdf(data, await loadLetterhead());
        } catch (err) { setError(apiError(err, 'Failed to export.')); } finally { setExporting(''); }
    };

    return (
        <div>
            <PageHeader title="Fabric stock" subtitle="Fabric in the store, roll by roll: who holds it, dye lot, width and location. Planning allocates from here; the store picks rolls when issuing to cutting."
                actions={<>
                    <SearchInput value={search} onChange={setSearch} placeholder="Fabric, roll no., lot, location" />
                    <SecondaryButton onClick={() => exportStock('excel')} disabled={!shown.length || !!exporting}><FileSpreadsheet size={14} /> {exporting === 'excel' ? 'Exporting…' : 'Excel'}</SecondaryButton>
                    <SecondaryButton onClick={() => exportStock('pdf')} disabled={!shown.length || !!exporting}><FileText size={14} /> {exporting === 'pdf' ? 'Exporting…' : 'PDF'}</SecondaryButton>
                    <SecondaryButton onClick={() => exportStock('count')} disabled={!shown.length || !!exporting}><ClipboardList size={14} /> {exporting === 'count' ? 'Exporting…' : 'Count sheet'}</SecondaryButton>
                    {perms.fabricStock && <SecondaryButton onClick={openOpening}><Plus size={15} /> Opening roll count</SecondaryButton>}
                </>} />
            <ErrorBox text={error} />
            {rows && (
                <div className="flex flex-wrap items-center gap-2 mb-2">
                    {FILTERS.map(f => (
                        <button key={f.key} type="button" onClick={() => setFilter(f.key)} aria-pressed={filter === f.key} className={`px-3 py-1 rounded-full text-sm font-semibold border ${filter === f.key ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-200 text-slate-600 hover:border-indigo-300'}`}>{f.label} <span className="tabular-nums">{rows.filter(f.test).length}</span></button>
                    ))}
                    {otherHits > 0 && <button type="button" className="text-sm font-semibold text-indigo-700 hover:underline" onClick={() => setFilter('ALL')}>{otherHits} more match{otherHits === 1 ? 'es' : ''} under All</button>}
                </div>
            )}
            {!rows ? (!error && <Loading />) : (
                <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
                    <table className="w-full text-sm min-w-[860px]">
                        <thead className="bg-slate-50 text-xs font-bold text-slate-500 uppercase tracking-wider">
                            <tr className="text-right"><th className="px-4 py-2.5 text-left">Fabric</th><th className="px-4 py-2.5">On hand</th><th className="px-4 py-2.5">Rolls</th><th className="px-4 py-2.5">Lots</th><th className="px-4 py-2.5">Allocated</th><th className="px-4 py-2.5">Free</th></tr>
                        </thead>
                        <tbody>
                            {shown.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">No fabric {search.trim() ? 'matches this search' : 'here'} under {active.label}.</td></tr>}
                            {shown.map(r => (
                                <Fragment key={r.id}>
                                    <tr className="border-t border-slate-100 text-right tabular-nums">
                                        <td className="px-4 py-2.5 text-left">
                                            <button type="button" onClick={() => toggle(String(r.id))} className="inline-flex items-center gap-1 font-semibold text-slate-800 hover:text-indigo-700 text-left">
                                                {open.has(String(r.id)) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}{r.label}
                                            </button>
                                            {!r.is_active && <span className="ml-1 text-[10px] font-bold text-rose-600">inactive</span>}
                                            {r.rolls_missing_data > 0 && <span className="block pl-5 text-[11px] text-amber-700">{r.rolls_missing_data} roll{r.rolls_missing_data === 1 ? '' : 's'} missing lot, width or location</span>}
                                        </td>
                                        <td className="px-4 py-2.5 font-black">{fmtQty(r.on_hand)} <span className="text-xs font-normal text-slate-500">{r.uom}</span></td>
                                        <td className="px-4 py-2.5">{r.rolls}</td>
                                        <td className="px-4 py-2.5">{r.dye_lots.length || '—'}</td>
                                        <td className="px-4 py-2.5">{fmtQty(r.allocated)} <span className="text-xs font-normal text-slate-500">{r.uom}</span></td>
                                        <td className={`px-4 py-2.5 font-semibold ${r.free < 0 ? 'text-rose-700' : ''}`}>{fmtQty(r.free)} <span className="text-xs font-normal">{r.uom}</span>{r.free < 0 && <span className="block text-[11px]">over-allocated</span>}</td>
                                    </tr>
                                    {open.has(String(r.id)) && (
                                        <tr className="bg-slate-50/60"><td colSpan={6} className="px-4 py-2">
                                            <RollsPanel item={r} rolls={rolls[r.id]} loadError={rollsError[r.id]} onRetry={() => loadRolls(r.id)} finishedShown={finishedShown.has(String(r.id))} onToggleFinished={() => toggleFinished(String(r.id))}
                                                canAdjust={perms.fabricStock} onAdjust={(x) => { setFormError(''); setAdjust({ roll: x, item: r, counted: '', code: '', note: '' }); }}
                                                canCorrect={perms.rollLocation} onCorrect={(x) => { setFormError(''); setDetails({ roll: x, location: x.location || '', dye_lot: x.dye_lot || '', width: x.width ? String(x.width) : '', width_unit: x.width_unit || 'in', reason: '' }); }}
                                                onHistory={showLedger} orderLink={orderLink} />
                                        </td></tr>
                                    )}
                                </Fragment>
                            ))}
                        </tbody>
                        {shown.length > 0 && (
                            <tfoot className="bg-slate-50 border-t-2 border-slate-200 font-black text-right tabular-nums"><tr>
                                <td className="px-4 py-2.5 text-left">Total · {shown.length} fabric{shown.length === 1 ? '' : 's'}</td>
                                <td className="px-4 py-2.5">{perUnit(shown, 'on_hand')}</td>
                                <td className="px-4 py-2.5">{shown.reduce((s, r) => s + r.rolls, 0)}</td>
                                <td className="px-4 py-2.5" />
                                <td className="px-4 py-2.5">{perUnit(shown, 'allocated')}</td>
                                <td className="px-4 py-2.5">{perUnit(shown, 'free')}</td>
                            </tr></tfoot>
                        )}
                    </table>
                </div>
            )}

            {opening && (
                <Modal title="Opening roll count" onClose={() => setOpening(null)}>
                    <div className="space-y-3 w-[min(860px,94vw)] max-h-[75vh] overflow-y-auto pr-1">
                        <Field label="Fabric *">
                            <select className={inputCls} value={opening.itemId} onChange={e => setOpening({ ...opening, itemId: e.target.value })} autoFocus>
                                <option value="">— pick —</option>
                                {items.map(i => <option key={i.id} value={i.id}>{i.mill} · {i.article_code} · {i.shade_code}{i.shade_name ? ` ${i.shade_name}` : ''} ({i.usage_uom})</option>)}
                            </select>
                        </Field>
                        <Field label="Paste from Excel (optional)" hint="Columns: roll no. ⇥ dye lot ⇥ quantity ⇥ width ⇥ location. One roll per row.">
                            <div className="flex gap-2 items-start">
                                <textarea className={`${inputCls} min-h-[56px] font-mono text-xs`} value={opening.paste} onChange={e => setOpening({ ...opening, paste: e.target.value })} />
                                <SecondaryButton onClick={applyPaste} disabled={!opening.paste.trim()}>Add rows</SecondaryButton>
                            </div>
                        </Field>
                        <LocationList area="FABRIC" /><table className="w-full text-sm">
                            <thead className="text-xs text-slate-500 text-left"><tr><th className="py-1">Roll no. *</th><th>Dye lot</th><th>Quantity{openingUnit ? ` (${openingUnit})` : ''} *</th><th>Width (in)</th><th>Location</th><th /></tr></thead>
                            <tbody>
                                {opening.rows.map((r, i) => (
                                    <tr key={i}>
                                        <td className="pr-1 py-0.5"><input className={inputCls} value={r.roll_no} onChange={e => setRow(i, { roll_no: e.target.value })} aria-label={`Roll ${i + 1} number`} /></td>
                                        <td className="pr-1"><input className={inputCls} value={r.dye_lot} onChange={e => setRow(i, { dye_lot: e.target.value })} aria-label={`Roll ${i + 1} dye lot`} /></td>
                                        <td className="pr-1"><input className={`${inputCls} text-right`} type="number" min="0" step="any" value={r.qty} onChange={e => setRow(i, { qty: e.target.value })} aria-label={`Roll ${i + 1} quantity`} /></td>
                                        <td className="pr-1"><input className={`${inputCls} text-right`} type="number" min="0" step="any" value={r.width} onChange={e => setRow(i, { width: e.target.value })} aria-label={`Roll ${i + 1} width`} /></td>
                                        <td className="pr-1"><input className={inputCls} list="v3-locations-FABRIC" value={r.location} onChange={e => setRow(i, { location: e.target.value })} aria-label={`Roll ${i + 1} location`} /></td>
                                        <td><button type="button" className="p-1 text-rose-500" onClick={() => setOpening({ ...opening, rows: opening.rows.filter((_, j) => j !== i) })} aria-label={`Remove row ${i + 1}`}><Trash2 size={14} /></button></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        <div className="flex items-center gap-3">
                            <SecondaryButton onClick={() => setOpening({ ...opening, rows: [...opening.rows, blankRow()] })}><Plus size={13} /> Add roll</SecondaryButton>
                            <span className="text-sm text-slate-600">{opening.rows.filter(r => r.roll_no).length} roll(s), {fmtQty(openingTotal)} {openingUnit} total</span>
                        </div>
                        <Field label="Note"><input className={inputCls} value={opening.note} onChange={e => setOpening({ ...opening, note: e.target.value })} placeholder="Opening stock count" /></Field>
                        <ErrorBox text={formError} />
                        <div className="flex justify-end gap-2">
                            <SecondaryButton onClick={() => setOpening(null)}>Cancel</SecondaryButton>
                            <PrimaryButton onClick={saveOpening} busy={busy} disabled={busy || !opening.itemId || !opening.rows.some(r => r.roll_no && Number(r.qty) > 0)}>Save rolls</PrimaryButton>
                        </div>
                    </div>
                </Modal>
            )}

            {adjust && (
                <Modal title={`Adjust roll ${adjust.roll.roll_no}`} onClose={() => setAdjust(null)}>
                    <div className="space-y-3 w-[min(440px,85vw)]">
                        <p className="text-sm text-slate-600">{adjust.roll.item_label} · now {fmtQty(adjust.roll.qty)} {adjust.roll.uom}</p>
                        {adjust.roll.held_by.length > 0 && <p className="text-xs rounded-lg bg-amber-50 border border-amber-200 text-amber-900 px-2.5 py-1.5">This roll is held by <b>{adjust.roll.held_by.map(h => h.order_no).join(', ')}</b>. It can't be reduced until it is un-assigned from the order; adding to it raises the order's allocation.</p>}
                        {adjust.roll.held_by.length === 0 && adjust.item?.allocated > 0 && <p className="text-xs rounded-lg bg-amber-50 border border-amber-200 text-amber-900 px-2.5 py-1.5">This fabric: {fmtQty(adjust.item.allocated)} {adjust.roll.uom} allocated to orders, <b>{fmtQty(Math.max(0, adjust.item.free))} {adjust.roll.uom} free</b>. A reduction can't take allocated fabric — release it from the order (Order BOM) first.</p>}
                        <Field label={`Counted (${adjust.roll.uom}) *`} hint="What is on the roll now. The difference is posted."><input className={inputCls} type="number" min="0" step="any" value={adjust.counted} onChange={e => setAdjust({ ...adjust, counted: e.target.value })} autoFocus /></Field>
                        {adjustDiff != null && <p className={`text-sm font-semibold ${adjustDiff < 0 ? 'text-rose-700' : adjustDiff > 0 ? 'text-emerald-700' : 'text-slate-500'}`}>{adjustDiff === 0 ? 'Same as the roll: nothing to adjust.' : `Difference ${adjustDiff > 0 ? '+' : ''}${fmtQty(adjustDiff)} ${adjust.roll.uom} · the roll becomes ${fmtQty(Number(adjust.counted))} ${adjust.roll.uom}`}</p>}
                        {adjust.counted !== '' && Number(adjust.counted) === 0 && <p className="text-xs rounded-lg bg-amber-50 border border-amber-200 text-amber-900 px-2.5 py-1.5">This takes the roll to 0 and finishes it. A finished roll can't be adjusted afterwards.</p>}
                        <Field label="Reason *"><select className={inputCls} value={adjust.code} onChange={e => setAdjust({ ...adjust, code: e.target.value })}><option value="">— pick —</option>{REASONS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
                        <Field label={`Note${adjust.code === 'OTHER' ? ' *' : ''}`}><input className={inputCls} value={adjust.note} onChange={e => setAdjust({ ...adjust, note: e.target.value })} /></Field>
                        <ErrorBox text={formError} />
                        <div className="flex justify-end gap-2">
                            <SecondaryButton onClick={() => setAdjust(null)}>Cancel</SecondaryButton>
                            <PrimaryButton onClick={saveAdjust} busy={busy} disabled={busy || adjustDiff == null || adjustDiff === 0 || Number(adjust.counted) < 0 || !adjust.code || (adjust.code === 'OTHER' && !adjust.note.trim()) || (adjust.roll.held_by.length > 0 && adjustDiff < 0)}>Post</PrimaryButton>
                        </div>
                    </div>
                </Modal>
            )}

            {details && (
                <Modal title={`Roll ${details.roll.roll_no} — details`} onClose={() => setDetails(null)}>
                    <div className="space-y-3 w-[min(480px,85vw)]">
                        <p className="text-sm text-slate-600">{details.roll.item_label}</p>
                        <LocationList area="FABRIC" />
                        <Field label="Location"><input className={inputCls} list="v3-locations-FABRIC" value={details.location} onChange={e => setDetails({ ...details, location: e.target.value })} autoFocus /></Field>
                        <Field label="Dye lot"><input className={inputCls} value={details.dye_lot} disabled={!perms.rollDetails} onChange={e => setDetails({ ...details, dye_lot: e.target.value })} /></Field>
                        <div className="grid grid-cols-2 gap-3">
                            <Field label="Width"><input className={inputCls} type="number" min="0" step="any" value={details.width} disabled={!perms.rollDetails} onChange={e => setDetails({ ...details, width: e.target.value })} /></Field>
                            <Field label="Unit"><select className={inputCls} value={details.width_unit} disabled={!perms.rollDetails} onChange={e => setDetails({ ...details, width_unit: e.target.value })}><option value="in">in</option><option value="cm">cm</option></select></Field>
                        </div>
                        {!perms.rollDetails && <p className="text-xs text-slate-500">Only the factory admin can correct the dye lot or width.</p>}
                        {needsReason && <Field label="Reason *" hint="Dye lot and width decide what is cut together. The GRN and slips keep what they recorded."><input className={inputCls} value={details.reason} onChange={e => setDetails({ ...details, reason: e.target.value })} /></Field>}
                        <ErrorBox text={formError} />
                        <div className="flex justify-end gap-2">
                            <SecondaryButton onClick={() => setDetails(null)}>Cancel</SecondaryButton>
                            <PrimaryButton onClick={saveDetails} busy={busy} disabled={busy || Object.keys(changed).length === 0 || (needsReason && !details.reason.trim())}>Save</PrimaryButton>
                        </div>
                    </div>
                </Modal>
            )}

            {ledger && (
                <Modal title={`Roll ${ledger.roll.roll_no} — history`} onClose={() => setLedger(null)}>
                    <div className="w-[min(760px,90vw)] max-h-[60vh] overflow-y-auto">
                        <table className="w-full text-sm">
                            <thead className="text-xs text-slate-500 text-left"><tr><th className="py-1">When</th><th>What</th><th className="text-right">Change</th><th className="text-right">Roll after</th><th className="pl-3">Slip</th><th className="pl-3">Reason / by</th></tr></thead>
                            <tbody>
                                {ledger.rows.map(l => (
                                    <tr key={l.id} className="border-t border-slate-100">
                                        <td className="py-1 text-xs text-slate-500">{new Date(l.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                                        <td>{KIND[l.kind] || l.kind}</td>
                                        <td className={`text-right tabular-nums ${l.quantity < 0 ? 'text-rose-700' : 'text-emerald-700'}`}>{l.quantity == null ? '—' : `${l.quantity > 0 ? '+' : ''}${fmtQty(l.quantity)}`}</td>
                                        <td className="text-right tabular-nums">{l.balance_after == null ? '—' : fmtQty(l.balance_after)}</td>
                                        <td className="pl-3 text-xs whitespace-nowrap">{!l.reference_no ? '—' : canOpen(SLIP_PATH[l.reference_type] + l.reference_id) ? <Link to={SLIP_PATH[l.reference_type] + l.reference_id} className="font-semibold text-indigo-700 hover:underline">{l.reference_no}</Link> : l.reference_no}</td>
                                        <td className="pl-3 text-xs text-slate-600">{l.kind === 'DETAILS' && `${l.field_label}: ${l.old_value || '—'} → ${l.new_value || '—'}${l.reason ? ' · ' : ''}`}{l.reason || ''}{l.user_name ? ` · ${l.user_name}` : ''}</td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot><tr className="border-t-2 border-slate-200 font-bold tabular-nums"><td colSpan={2} className="py-1">Net change · {ledger.rows.filter(l => l.quantity != null).length} move{ledger.rows.filter(l => l.quantity != null).length === 1 ? '' : 's'}</td><td className="text-right">{fmtQty(ledger.rows.reduce((s, l) => s + (l.quantity || 0), 0))}</td><td className="text-right">{fmtQty(ledger.roll.qty)}</td><td colSpan={2} /></tr></tfoot>
                        </table>
                    </div>
                </Modal>
            )}
        </div>
    );
}

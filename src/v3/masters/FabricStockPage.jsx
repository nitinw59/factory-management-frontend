// Fabric stock: rolls per fabric item (roll no., dye lot, width, current
// metres / kg). On hand = the item's rolls in stock; planning allocates from
// it. Opening roll count (paste from Excel), per-roll adjustments and history.
import { Fragment, useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, Plus, History, SlidersHorizontal, Trash2 } from 'lucide-react';
import Modal from '../../shared/Modal';
import { mastersApi, apiError } from '../api/mastersApi';
import { PageHeader, SearchInput, Field, inputCls, PrimaryButton, SecondaryButton, ErrorBox, Loading, fmtQty, useMastersPermissions } from '../components/ui';

const blankRow = () => ({ roll_no: '', dye_lot: '', qty: '', width: '', location: '' });
const KIND = { OPENING: 'Opening count', GRN: 'Received (GRN)', ISSUE: 'Issued', RETURN: 'Returned', ADJUSTMENT: 'Adjustment' };

export default function FabricStockPage() {
    const perms = useMastersPermissions();
    const [rows, setRows] = useState(null);
    const [search, setSearch] = useState('');
    const [open, setOpen] = useState(new Set());
    const [rolls, setRolls] = useState({});            // itemId → rolls
    const [showFinished, setShowFinished] = useState(false);
    const [error, setError] = useState('');
    const [opening, setOpening] = useState(null);      // { itemId, rows, note, paste }
    const [adjust, setAdjust] = useState(null);        // { roll, quantity, reason }
    const [ledger, setLedger] = useState(null);        // { roll, rows }
    const [items, setItems] = useState([]);
    const [busy, setBusy] = useState(false);
    const [formError, setFormError] = useState('');

    const load = useCallback(() => mastersApi.fabricStock({ q: search.trim() || undefined })
        .then(res => setRows(res.data)).catch(err => setError(apiError(err, 'Failed to load fabric stock.'))), [search]);
    useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

    const loadRolls = useCallback((itemId) => mastersApi.fabricRolls({ fabric_item_id: itemId })
        .then(res => setRolls(prev => ({ ...prev, [itemId]: res.data }))).catch(() => {}), []);
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
            .map(c => ({ roll_no: c[0]?.trim() || '', dye_lot: c[1]?.trim() || '', qty: (c[2] || '').replace(/[^\d.]/g, ''), width: (c[3] || '').replace(/[^\d.]/g, ''), location: c[4]?.trim() || '' }));
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
            await mastersApi.adjustRoll(adjust.roll.id, { quantity: Number(adjust.quantity), reason: adjust.reason });
            const itemId = adjust.roll.fabric_item_id;
            setAdjust(null); refresh(String(itemId));
        } catch (err) { setFormError(apiError(err, 'Failed to save.')); } finally { setBusy(false); }
    };
    const showLedger = (roll) => mastersApi.rollLedger(roll.id).then(res => setLedger({ roll, rows: res.data })).catch(err => setError(apiError(err, 'Failed to load history.')));

    const openingTotal = opening ? opening.rows.reduce((s, r) => s + (Number(r.qty) || 0), 0) : 0;

    return (
        <div>
            <PageHeader title="Fabric stock" subtitle="Fabric held as rolls (roll no., dye lot, width). Planning allocates from what is in stock; the store picks rolls and dye lot when issuing to cutting."
                actions={<>
                    <SearchInput value={search} onChange={setSearch} placeholder="Mill, article, shade" />
                    {perms.fabricStock && <PrimaryButton onClick={openOpening}><Plus size={15} /> Opening roll count</PrimaryButton>}
                </>} />
            <ErrorBox text={error} />
            <label className="flex items-center gap-1.5 text-sm text-slate-600 mb-2"><input type="checkbox" checked={showFinished} onChange={e => setShowFinished(e.target.checked)} /> Show finished rolls</label>
            {!rows ? <Loading /> : (
                <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
                    <table className="w-full text-sm min-w-[860px]">
                        <thead className="bg-slate-50 text-xs font-bold text-slate-500 uppercase tracking-wider">
                            <tr className="text-right"><th className="px-4 py-2.5 text-left">Fabric</th><th className="px-4 py-2.5">On hand</th><th className="px-4 py-2.5">Rolls</th><th className="px-4 py-2.5 text-left">Dye lots</th><th className="px-4 py-2.5">Allocated</th><th className="px-4 py-2.5">Free</th></tr>
                        </thead>
                        <tbody>
                            {rows.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">No fabric items.</td></tr>}
                            {rows.map(r => (
                                <Fragment key={r.id}>
                                    <tr className="border-t border-slate-100 text-right tabular-nums">
                                        <td className="px-4 py-2.5 text-left">
                                            <button type="button" onClick={() => toggle(String(r.id))} className="inline-flex items-center gap-1 font-semibold text-slate-800 hover:text-indigo-700 text-left">
                                                {open.has(String(r.id)) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}{r.label}
                                            </button>
                                            {!r.is_active && <span className="ml-1 text-[10px] font-bold text-rose-600">inactive</span>}
                                        </td>
                                        <td className="px-4 py-2.5 font-black">{fmtQty(r.on_hand)} <span className="text-xs font-normal text-slate-500">{r.uom}</span></td>
                                        <td className="px-4 py-2.5">{r.rolls}</td>
                                        <td className="px-4 py-2.5 text-left text-xs">{r.dye_lots.join(', ') || '—'}</td>
                                        <td className="px-4 py-2.5">{fmtQty(r.allocated)}</td>
                                        <td className={`px-4 py-2.5 font-semibold ${r.free < 0 ? 'text-rose-700' : ''}`}>{fmtQty(r.free)}{r.free < 0 && <span className="block text-[11px]">over-allocated</span>}</td>
                                    </tr>
                                    {open.has(String(r.id)) && (
                                        <tr className="bg-slate-50/60"><td colSpan={6} className="px-4 py-2">
                                            {!rolls[r.id] ? <Loading /> : (
                                                <table className="w-full text-xs">
                                                    <thead className="text-slate-500 text-right"><tr><th className="text-left py-1">Roll</th><th className="text-left">Dye lot</th><th>Width</th><th>Qty</th><th>Received</th><th className="text-left pl-4">Location</th><th className="text-left">From</th><th className="w-40" /></tr></thead>
                                                    <tbody>
                                                        {rolls[r.id].filter(x => showFinished || x.status === 'IN_STOCK').map(x => (
                                                            <tr key={x.id} className={`border-t border-slate-200 text-right tabular-nums ${x.status === 'FINISHED' ? 'text-slate-400' : ''}`}>
                                                                <td className="text-left py-1 font-semibold">{x.roll_no}{x.status === 'FINISHED' && <span className="ml-1 text-[10px]">finished</span>}</td>
                                                                <td className="text-left">{x.dye_lot || '—'}</td>
                                                                <td>{x.width ? `${x.width} ${x.width_unit}` : '—'}</td>
                                                                <td className="font-bold">{fmtQty(x.qty)} {x.uom}</td>
                                                                <td>{fmtQty(x.original_qty)}</td>
                                                                <td className="text-left pl-4">{x.location || '—'}</td>
                                                                <td className="text-left">{x.source === 'OPENING' ? 'Opening' : 'GRN'}</td>
                                                                <td className="text-right whitespace-nowrap">
                                                                    {perms.fabricStock && <button type="button" className="mr-2 inline-flex items-center gap-0.5 font-semibold text-indigo-700" onClick={() => { setFormError(''); setAdjust({ roll: x, quantity: '', reason: '' }); }}><SlidersHorizontal size={11} /> Adjust</button>}
                                                                    <button type="button" className="inline-flex items-center gap-0.5 font-semibold text-slate-600" onClick={() => showLedger(x)}><History size={11} /> History</button>
                                                                </td>
                                                            </tr>
                                                        ))}
                                                        {rolls[r.id].filter(x => showFinished || x.status === 'IN_STOCK').length === 0 && <tr><td colSpan={8} className="py-2 text-slate-400">No rolls{showFinished ? '' : ' in stock'}.</td></tr>}
                                                    </tbody>
                                                </table>
                                            )}
                                        </td></tr>
                                    )}
                                </Fragment>
                            ))}
                        </tbody>
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
                        <table className="w-full text-sm">
                            <thead className="text-xs text-slate-500 text-left"><tr><th className="py-1">Roll no. *</th><th>Dye lot</th><th>Quantity *</th><th>Width (in)</th><th>Location</th><th /></tr></thead>
                            <tbody>
                                {opening.rows.map((r, i) => (
                                    <tr key={i}>
                                        <td className="pr-1 py-0.5"><input className={inputCls} value={r.roll_no} onChange={e => setRow(i, { roll_no: e.target.value })} aria-label={`Roll ${i + 1} number`} /></td>
                                        <td className="pr-1"><input className={inputCls} value={r.dye_lot} onChange={e => setRow(i, { dye_lot: e.target.value })} aria-label={`Roll ${i + 1} dye lot`} /></td>
                                        <td className="pr-1"><input className={`${inputCls} text-right`} type="number" min="0" step="any" value={r.qty} onChange={e => setRow(i, { qty: e.target.value })} aria-label={`Roll ${i + 1} quantity`} /></td>
                                        <td className="pr-1"><input className={`${inputCls} text-right`} type="number" min="0" step="any" value={r.width} onChange={e => setRow(i, { width: e.target.value })} aria-label={`Roll ${i + 1} width`} /></td>
                                        <td className="pr-1"><input className={inputCls} value={r.location} onChange={e => setRow(i, { location: e.target.value })} aria-label={`Roll ${i + 1} location`} /></td>
                                        <td><button type="button" className="p-1 text-rose-500" onClick={() => setOpening({ ...opening, rows: opening.rows.filter((_, j) => j !== i) })} aria-label={`Remove row ${i + 1}`}><Trash2 size={14} /></button></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        <div className="flex items-center gap-3">
                            <SecondaryButton onClick={() => setOpening({ ...opening, rows: [...opening.rows, blankRow()] })}><Plus size={13} /> Add roll</SecondaryButton>
                            <span className="text-sm text-slate-600">{opening.rows.filter(r => r.roll_no).length} roll(s), {fmtQty(openingTotal)} total</span>
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
                        <Field label={`Change (${adjust.roll.uom}) *`} hint="Negative to reduce (damage, recount), positive to add. The roll can't go below 0."><input className={inputCls} type="number" step="any" value={adjust.quantity} onChange={e => setAdjust({ ...adjust, quantity: e.target.value })} autoFocus /></Field>
                        <Field label="Reason *"><input className={inputCls} value={adjust.reason} onChange={e => setAdjust({ ...adjust, reason: e.target.value })} /></Field>
                        <ErrorBox text={formError} />
                        <div className="flex justify-end gap-2">
                            <SecondaryButton onClick={() => setAdjust(null)}>Cancel</SecondaryButton>
                            <PrimaryButton onClick={saveAdjust} busy={busy} disabled={busy || !Number(adjust.quantity) || !adjust.reason.trim()}>Post</PrimaryButton>
                        </div>
                    </div>
                </Modal>
            )}

            {ledger && (
                <Modal title={`Roll ${ledger.roll.roll_no} — history`} onClose={() => setLedger(null)}>
                    <div className="w-[min(620px,90vw)] max-h-[60vh] overflow-y-auto">
                        <table className="w-full text-sm">
                            <thead className="text-xs text-slate-500 text-left"><tr><th className="py-1">When</th><th>What</th><th className="text-right">Change</th><th className="text-right">Roll after</th><th className="pl-3">Reason / by</th></tr></thead>
                            <tbody>
                                {ledger.rows.map(l => (
                                    <tr key={l.id} className="border-t border-slate-100">
                                        <td className="py-1 text-xs text-slate-500">{new Date(l.created_at).toLocaleString()}</td>
                                        <td>{KIND[l.kind] || l.kind}</td>
                                        <td className={`text-right tabular-nums ${l.quantity < 0 ? 'text-rose-700' : 'text-emerald-700'}`}>{l.quantity > 0 ? '+' : ''}{fmtQty(l.quantity)}</td>
                                        <td className="text-right tabular-nums">{fmtQty(l.balance_after)}</td>
                                        <td className="pl-3 text-xs text-slate-600">{l.reason || ''}{l.user_name ? ` · ${l.user_name}` : ''}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Modal>
            )}
        </div>
    );
}

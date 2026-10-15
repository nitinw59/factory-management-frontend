// One sales order line: style + BOM version, ship date, and the garment
// colour × size quantity grid (rows = the BOM's colours, columns = the style's
// sizes) with row / column / line totals. Pasting a block copied from Excel
// fills the grid from the cell pasted into. On an approved order every save
// needs a reason (it becomes a revision); lines are cancelled, not deleted.
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Trash2, AlertTriangle, XCircle, RefreshCw, ClipboardList, FileDown } from 'lucide-react';
import { inputCls, PrimaryButton, SecondaryButton, ErrorBox } from '../components/ui';
import { apiError, mastersApi } from '../api/mastersApi';
import { fmtDate } from './SalesOrderStatusBadge';

const keyOf = (cid, sid) => `${cid}:${sid}`;
const toCells = (line) => Object.fromEntries(line.qty.map(x => [keyOf(x.garment_colour_id, x.size_id), String(x.qty)]));
const fmt = (n) => Number(n || 0).toLocaleString('en-IN');
const rowTotalOf = (cells, cid) => Object.entries(cells).filter(([k]) => k.startsWith(`${cid}:`)).reduce((n, [, v]) => n + Number(v || 0), 0);

// proposing (15 Oct 2026): an approved order — saves go into its change request; the card shows the proposed values.
export default function OrderLineCard({ line: approvedLine, orderId, onPpm, ppmCount = 0, onDocuments, editable, canDelete, needsReason, proposing = false, onSave, onDelete, onCancelLine, onMoveBom, onUndoCancel }) {
    // What the card edits: the proposed values when this line has a proposed change, else the line as it is.
    const line = useMemo(() => (proposing && approvedLine.proposed ? { ...approvedLine, ...approvedLine.proposed, qty: approvedLine.proposed.qty } : approvedLine), [approvedLine, proposing]);
    const [cells, setCells] = useState(() => toCells(line));
    const [shipDate, setShipDate] = useState(line.ship_date || '');
    const [notes, setNotes] = useState(line.notes || '');
    const [brand, setBrand] = useState(line.brand || '');   // starts from the style's brand

    const [reason, setReason] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    // Style BOM version (15 Oct 2026): a draft line picks one of the style's approved versions; its colours are the
    // version's (others are refused on save). Only while the style has no approved version is the line "BOM pending"
    // with any colour (search). Approved order (proposing): another version can be proposed — e.g. one with a colour
    // the buyer added; the merchandiser approves it with the other changes.
    const versions = line.approved_versions || [];
    const pickVersion = editable && !needsReason && versions.length > 0;
    const [bomId, setBomId] = useState(line.bom_id ? String(line.bom_id) : '');
    useEffect(() => { setCells(toCells(line)); setShipDate(line.ship_date || ''); setNotes(line.notes || ''); setBrand(line.brand || ''); setBomId(line.bom_id ? String(line.bom_id) : ''); }, [line]);
    const picked = pickVersion ? versions.find(v => v.id === bomId) || null : null;
    const canAddColour = editable && !needsReason && !proposing && versions.length === 0;
    const [extraColours, setExtraColours] = useState([]);
    const [colourQ, setColourQ] = useState('');
    const [colourHits, setColourHits] = useState([]);
    const colours = useMemo(() => {
        if (picked) {
            // The version's colours, plus any colour that has quantities but isn't on it (flagged; must be cleared).
            const off = line.colours.filter(c => !picked.colours.some(b => b.garment_colour_id === c.garment_colour_id) && rowTotalOf(cells, c.garment_colour_id) > 0);
            return [...picked.colours, ...off.map(c => ({ ...c, on_bom: false }))];
        }
        return [...line.colours, ...extraColours.filter(c => !line.colours.some(x => x.garment_colour_id === c.garment_colour_id))];
    }, [picked, line.colours, extraColours, cells]);
    const offBom = colours.filter(c => c.on_bom === false && rowTotalOf(cells, c.garment_colour_id) > 0).map(c => c.name);
    useEffect(() => {
        if (!canAddColour || colourQ.trim().length < 2) { setColourHits([]); return undefined; }
        const t = setTimeout(() => mastersApi.garmentColours({ search: colourQ.trim() }).then(res => setColourHits(res.data.filter(c => c.is_active).slice(0, 12))).catch(() => setColourHits([])), 250);
        return () => clearTimeout(t);
    }, [colourQ, canAddColour]);

    const original = useMemo(() => JSON.stringify([toCells(line), line.ship_date || '', line.notes || '', line.brand || '', line.bom_id ? String(line.bom_id) : '']), [line]);
    const dirty = JSON.stringify([Object.fromEntries(Object.entries(cells).filter(([, v]) => v !== '' && Number(v) !== 0)), shipDate, notes, brand, bomId]) !== original;

    const val = (cid, sid) => Number(cells[keyOf(cid, sid)] || 0);
    const rowTotal = (cid) => line.sizes.reduce((n, s) => n + val(cid, s.size_id), 0);
    const colTotal = (sid) => colours.reduce((n, c) => n + val(c.garment_colour_id, sid), 0);
    const total = colours.reduce((n, c) => n + rowTotal(c.garment_colour_id), 0);
    const cancelled = line.status === 'CANCELLED';

    const setCell = (cid, sid, v) => setCells(prev => ({ ...prev, [keyOf(cid, sid)]: v.replace(/[^\d]/g, '') }));

    // Paste a tab / newline separated block (from Excel) starting at this cell.
    const onPaste = (e, rowIdx, colIdx) => {
        const textData = e.clipboardData.getData('text');
        if (!/[\t\n]/.test(textData.trim())) return; // single value: normal paste
        e.preventDefault();
        const rows = textData.replace(/\r/g, '').split('\n').filter((r, i, a) => r !== '' || i < a.length - 1);
        setCells(prev => {
            const next = { ...prev };
            rows.forEach((r, i) => r.split('\t').forEach((v, j) => {
                const c = colours[rowIdx + i];
                const s = line.sizes[colIdx + j];
                if (c && s && c.is_active) next[keyOf(c.garment_colour_id, s.size_id)] = String(v).replace(/[^\d]/g, '');
            }));
            return next;
        });
    };

    const save = async () => {
        setSaving(true); setError('');
        try {
            await onSave({
                ship_date: shipDate || null, notes, brand, ...(needsReason && { reason }), ...(pickVersion && { bom_id: bomId || null }),
                qty: Object.entries(cells).filter(([, v]) => v !== '' && Number(v) > 0).map(([k, v]) => {
                    const [garment_colour_id, size_id] = k.split(':');
                    return { garment_colour_id, size_id, qty: Number(v) };
                }),
            });
        } catch (err) {
            setError(apiError(err, 'Failed to save the line.'));
        } finally {
            setSaving(false);
        }
    };
    const reset = () => { setCells(toCells(line)); setShipDate(line.ship_date || ''); setNotes(line.notes || ''); setBrand(line.brand || ''); setReason(''); setError(''); setExtraColours([]); setBomId(line.bom_id ? String(line.bom_id) : ''); };

    return (
        <div className={`bg-white border rounded-xl p-4 ${cancelled ? 'border-slate-200 opacity-60' : dirty ? 'border-indigo-300' : approvedLine.proposed_new || approvedLine.proposed ? 'border-amber-300' : 'border-slate-200'}`}>
            {approvedLine.proposed_new && <p className="mb-2 text-xs font-bold text-amber-800">Proposed new line — added when the merchandiser approves the changes.</p>}
            {!approvedLine.proposed_new && approvedLine.proposed && <p className="mb-2 text-xs font-bold text-amber-800">Proposed change (shown below) — the approved line is {fmt(approvedLine.total_qty)} pcs{approvedLine.ship_date ? `, ship ${fmtDate(approvedLine.ship_date)}` : ''} until the merchandiser approves.</p>}
            {approvedLine.cancel_requested && <p className="mb-2 text-xs font-bold text-rose-700">Cancellation proposed: {approvedLine.cancel_requested.reason}{onUndoCancel && <button type="button" onClick={onUndoCancel} className="ml-2 font-semibold text-indigo-700 underline">Undo</button>}</p>}
            <div className="flex flex-wrap items-start gap-3 mb-3">
                <div className="flex-1 min-w-[220px]">
                    <p className="font-black text-slate-800">
                        {approvedLine.proposed_new ? 'New line' : `Line ${line.line_no}`} · <Link to={`/v3/styles/${line.style_id}`} className="text-indigo-700 hover:underline">{line.style_code}</Link>
                        <span className="font-normal text-slate-500"> {line.style_name}</span>
                    </p>
                    <p className="text-xs text-slate-500">
                        {pickVersion ? (
                            <span className="inline-flex flex-wrap items-center gap-1.5">
                                Style BOM
                                <select className="px-1.5 py-0.5 text-xs font-semibold border border-slate-300 rounded" value={bomId} onChange={e => setBomId(e.target.value)} aria-label="Style BOM version">
                                    <option value="">— pick the version —</option>
                                    {versions.map((v, i) => <option key={v.id} value={v.id}>v{v.version_no}{i === 0 ? ' (latest)' : ''} · {v.colours.length} colour{v.colours.length === 1 ? '' : 's'}: {v.colours.map(c => c.name).join(', ')}</option>)}
                                </select>
                                {picked && <Link to={`/v3/boms/${picked.id}`} className="font-semibold text-indigo-700 hover:underline">open v{picked.version_no}</Link>}
                                {picked && String(picked.id) === String(line.bom_id) && <Link to={`/v3/boms/${line.bom_id}/trim-card${orderId ? `?order=${orderId}` : ''}`} className="ml-1 inline-flex items-center gap-1 font-semibold text-indigo-700 hover:underline"><ClipboardList size={12} /> Trim card</Link>}
                            </span>
                        ) : line.bom_pending ? (
                            <span className="inline-flex items-center gap-1 font-bold text-amber-800 bg-amber-50 border border-amber-300 rounded px-1.5 py-0.5">
                                <AlertTriangle size={12} /> BOM pending{line.open_boms ? ` — Style BOM ${line.open_boms.replace('pending_approval', 'waiting for approval')}` : ' — no Style BOM yet'}
                            </span>
                        ) : <>
                            Style BOM <Link to={`/v3/boms/${line.bom_id}`} className="font-semibold text-indigo-700 hover:underline">v{line.bom_version}</Link>
                            <Link to={`/v3/boms/${line.bom_id}/trim-card${orderId ? `?order=${orderId}` : ''}`} className="ml-3 inline-flex items-center gap-1 font-semibold text-indigo-700 hover:underline">
                                <ClipboardList size={12} /> Trim card
                            </Link>
                        </>}
                        {onPpm && line.status === 'ACTIVE' && <>
                            <span className="ml-3 inline-flex items-center gap-1 font-semibold text-slate-600"><FileDown size={12} /> PPM template:</span>
                            <button type="button" onClick={() => onPpm('pdf')} className="ml-1 font-semibold text-indigo-700 hover:underline">PDF</button>
                            <span className="text-slate-300">·</span>
                            <button type="button" onClick={() => onPpm('xlsx')} className="font-semibold text-indigo-700 hover:underline">Excel</button>
                            <button type="button" onClick={onDocuments} className={`ml-2 font-semibold hover:underline ${ppmCount ? 'text-emerald-700' : 'text-amber-700'}`}>{ppmCount ? 'PPM uploaded' : 'PPM not uploaded'}</button>
                        </>}
                        {cancelled && <span className="ml-2 font-bold text-rose-700">Cancelled: {line.cancelled_reason}</span>}
                    </p>
                </div>
                <label className="text-xs font-bold text-slate-600">
                    Brand
                    {editable ? <input className={`${inputCls} mt-0.5 w-36`} value={brand} maxLength={60} placeholder={line.style_brand || '—'} onChange={e => setBrand(e.target.value)} />
                        : <span className="block text-sm font-semibold text-slate-800 mt-0.5">{line.brand || '—'}</span>}
                </label>
                <label className="text-xs font-bold text-slate-600">
                    Ship date
                    {editable ? <input type="date" className={`${inputCls} mt-0.5 w-40`} value={shipDate} onChange={e => setShipDate(e.target.value)} />
                        : <span className="block text-sm font-semibold text-slate-800 mt-0.5">{fmtDate(line.ship_date)}</span>}
                </label>
                <div className="text-right">
                    <p className="text-xs font-bold text-slate-500">Pieces</p>
                    <p className="text-xl font-black text-slate-900 tabular-nums">{fmt(total)}</p>
                </div>
                {editable && canDelete && (
                    <button type="button" onClick={onDelete} className="p-1.5 rounded text-rose-500 hover:bg-rose-50" aria-label={`Delete line ${line.line_no}`}><Trash2 size={16} /></button>
                )}
                {onCancelLine && (
                    <SecondaryButton onClick={onCancelLine}><XCircle size={14} /> Cancel line</SecondaryButton>
                )}
            </div>

            {line.bom_outdated && (
                <p className="mb-2 text-xs font-semibold text-amber-700 flex items-center gap-1">
                    <AlertTriangle size={13} /> Style BOM v{line.current_bom_version} (newer) is also approved.
                    {editable && !needsReason ? ` This line stays on v${line.bom_version} — pick v${line.current_bom_version} above if this order should use it.` : ` This line stays on v${line.bom_version} unless a merchandiser moves it.`}
                    {onMoveBom && <button type="button" onClick={onMoveBom} className="ml-2 inline-flex items-center gap-1 text-indigo-700 underline"><RefreshCw size={12} /> Move to v{line.current_bom_version}</button>}
                </p>
            )}
            {picked && colours.some(c => c.on_bom === false) && (
                <p className="mb-2 text-xs font-semibold text-rose-700">{colours.filter(c => c.on_bom === false).map(c => c.name).join(', ')} {colours.filter(c => c.on_bom === false).length === 1 ? 'is' : 'are'} not on Style BOM v{picked.version_no} — pick a version that has {colours.filter(c => c.on_bom === false).length === 1 ? 'it' : 'them'}, or clear the quantities.</p>
            )}
            {proposing && pickVersion && !cancelled && (
                <p className="mb-2 text-xs text-slate-500">A colour missing? Pick a Style BOM version that has it — or, if no version has it, the merchandiser adds it to the <Link to={`/v3/styles/${line.style_id}`} className="font-semibold text-indigo-700 hover:underline">style's BOM</Link> and approves a new version first.</p>
            )}
            {pickVersion && !picked && !cancelled && <p className="mb-2 text-xs font-semibold text-amber-800">Pick the Style BOM version for this line (the colours come from it).</p>}
            {line.bom_pending && !cancelled && !pickVersion && (
                <p className="mb-2 text-xs text-amber-800">
                    {line.current_bom_id
                        ? <>Style BOM v{line.current_bom_version} is approved but doesn't have every colour on this line{offBom.length ? ` (${offBom.join(', ')})` : ''}. The order can be submitted once a Style BOM version with {offBom.length === 1 ? 'it' : 'them'} is approved — the line links to it by itself — or take {offBom.length === 1 ? 'that colour' : 'those colours'} off. </>
                        : <>Quantities can be entered in any colour. The order can be submitted once this style's Style BOM is approved — the line links to it by itself; colours it doesn't have must come off. </>}
                    <Link to={`/v3/styles/${line.style_id}`} className="font-semibold text-indigo-700 hover:underline">Open the style →</Link>
                </p>
            )}
            {line.stray_qty > 0 && (
                <p className="mb-2 text-xs font-semibold text-rose-700 flex items-center gap-1">
                    <AlertTriangle size={13} /> {line.stray_qty} quantity cell(s) are for a colour or size this style / BOM no longer has.{editable ? ' Saving the line drops them.' : ''}
                </p>
            )}

            {canAddColour && (
                <div className="mb-2 flex flex-wrap items-center gap-1.5">
                    <input className={`${inputCls} !py-1 w-56`} value={colourQ} onChange={e => setColourQ(e.target.value)} placeholder="Add a colour — type its name…" aria-label="Add a colour" />
                    {colourHits.filter(c => !colours.some(x => x.garment_colour_id === String(c.id))).map(c => (
                        <button key={c.id} type="button" onClick={() => { setExtraColours([...extraColours, { garment_colour_id: String(c.id), name: c.name, is_active: true, on_bom: false }]); setColourQ(''); }}
                            className="px-2 py-1 rounded border border-slate-200 text-xs font-semibold text-slate-700 hover:border-indigo-400">+ {c.name}</button>
                    ))}
                </div>
            )}
            {colours.length === 0 || line.sizes.length === 0 ? (
                <p className="text-sm text-amber-700">{line.sizes.length === 0 ? 'The style has no sizes.' : canAddColour ? 'Add the colours being ordered (above).' : pickVersion && !picked ? 'Pick the Style BOM version first.' : 'This style\'s BOM has no colours.'}</p>
            ) : (
                <div className="overflow-x-auto">
                    <table className="border-collapse text-sm">
                        <thead>
                            <tr>
                                <th className="px-2 py-1.5 text-left text-xs font-bold text-slate-500 min-w-[140px]">Colour \ Size</th>
                                {line.sizes.map(s => <th key={s.size_id} className="px-1 py-1.5 text-center text-xs font-black text-slate-700 min-w-[64px]">{s.size_name}</th>)}
                                <th className="px-2 py-1.5 text-right text-xs font-bold text-slate-500 min-w-[70px]">Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            {colours.map((c, ri) => (
                                <tr key={c.garment_colour_id} className="border-t border-slate-100">
                                    <td className="px-2 py-1 font-semibold text-slate-700">{c.name}{!c.is_active && <span className="ml-1 text-[10px] font-bold text-rose-600">inactive</span>}{c.on_bom === false && <span className="ml-1 text-[10px] font-bold text-amber-700">not on Style BOM</span>}</td>
                                    {line.sizes.map((s, ci) => (
                                        <td key={s.size_id} className="px-1 py-1">
                                            {editable ? (
                                                <input className={`${inputCls} !px-1.5 !py-1 text-right tabular-nums w-16`} inputMode="numeric"
                                                    value={cells[keyOf(c.garment_colour_id, s.size_id)] || ''}
                                                    disabled={!c.is_active && !cells[keyOf(c.garment_colour_id, s.size_id)]}
                                                    onChange={e => setCell(c.garment_colour_id, s.size_id, e.target.value)}
                                                    onPaste={e => onPaste(e, ri, ci)}
                                                    aria-label={`${c.name} size ${s.size_name}`} />
                                            ) : (
                                                <span className="block text-right tabular-nums px-1.5">{val(c.garment_colour_id, s.size_id) ? fmt(val(c.garment_colour_id, s.size_id)) : <span className="text-slate-300">—</span>}</span>
                                            )}
                                        </td>
                                    ))}
                                    <td className="px-2 py-1 text-right font-bold tabular-nums">{fmt(rowTotal(c.garment_colour_id))}</td>
                                </tr>
                            ))}
                            <tr className="border-t-2 border-slate-200">
                                <td className="px-2 py-1.5 text-xs font-bold text-slate-500">Total</td>
                                {line.sizes.map(s => <td key={s.size_id} className="px-1 py-1.5 text-right font-bold tabular-nums pr-2.5">{fmt(colTotal(s.size_id))}</td>)}
                                <td className="px-2 py-1.5 text-right font-black tabular-nums">{fmt(total)}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            )}

            {editable ? (
                <div className="mt-3 flex flex-wrap items-end gap-2">
                    <input className={`${inputCls} flex-1 min-w-[200px]`} placeholder="Line notes" value={notes} onChange={e => setNotes(e.target.value)} aria-label="Line notes" />
                    {needsReason && dirty && (
                        <input className={`${inputCls} flex-1 min-w-[200px] border-amber-400`} placeholder="Reason for the change *" value={reason} onChange={e => setReason(e.target.value)} aria-label="Reason for the change" />
                    )}
                    {dirty && <SecondaryButton onClick={reset} disabled={saving}>Discard</SecondaryButton>}
                    <PrimaryButton onClick={save} busy={saving}
                        disabled={saving || (needsReason ? (!dirty || !reason.trim()) : (!dirty && !line.stray_qty))}>
                        {proposing ? 'Save as proposed change' : needsReason ? 'Save revision' : 'Save line'}
                    </PrimaryButton>
                </div>
            ) : line.notes ? <p className="mt-2 text-xs text-slate-500">{line.notes}</p> : null}
            {dirty && <p className="mt-1 text-[11px] font-bold text-indigo-700">Unsaved changes{proposing ? ' — this order is approved: saving adds it to the changes for the merchandiser' : needsReason ? ' — this order is approved, so saving creates a new revision' : ''}. Tip: paste a block copied from Excel into any cell.</p>}
            <div className="mt-2"><ErrorBox text={error} /></div>
        </div>
    );
}

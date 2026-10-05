// One sales order line: style + BOM version, ship date, and the garment
// colour × size quantity grid (rows = the BOM's colours, columns = the style's
// sizes) with row / column / line totals. Pasting a block copied from Excel
// fills the grid from the cell pasted into. On an approved order every save
// needs a reason (it becomes a revision); lines are cancelled, not deleted.
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Trash2, AlertTriangle, XCircle, RefreshCw } from 'lucide-react';
import { inputCls, PrimaryButton, SecondaryButton, ErrorBox } from '../components/ui';
import { apiError } from '../api/mastersApi';
import { fmtDate } from './SalesOrderStatusBadge';

const keyOf = (cid, sid) => `${cid}:${sid}`;
const toCells = (line) => Object.fromEntries(line.qty.map(x => [keyOf(x.garment_colour_id, x.size_id), String(x.qty)]));
const fmt = (n) => Number(n || 0).toLocaleString('en-IN');

export default function OrderLineCard({ line, editable, canDelete, needsReason, onSave, onDelete, onCancelLine, onMoveBom }) {
    const [cells, setCells] = useState(() => toCells(line));
    const [shipDate, setShipDate] = useState(line.ship_date || '');
    const [notes, setNotes] = useState(line.notes || '');
    const [reason, setReason] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const original = useMemo(() => JSON.stringify([toCells(line), line.ship_date || '', line.notes || '']), [line]);
    const dirty = JSON.stringify([Object.fromEntries(Object.entries(cells).filter(([, v]) => v !== '' && Number(v) !== 0)), shipDate, notes]) !== original;

    const val = (cid, sid) => Number(cells[keyOf(cid, sid)] || 0);
    const rowTotal = (cid) => line.sizes.reduce((n, s) => n + val(cid, s.size_id), 0);
    const colTotal = (sid) => line.colours.reduce((n, c) => n + val(c.garment_colour_id, sid), 0);
    const total = line.colours.reduce((n, c) => n + rowTotal(c.garment_colour_id), 0);
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
                const c = line.colours[rowIdx + i];
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
                ship_date: shipDate || null, notes, ...(needsReason && { reason }),
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
    const reset = () => { setCells(toCells(line)); setShipDate(line.ship_date || ''); setNotes(line.notes || ''); setReason(''); setError(''); };

    return (
        <div className={`bg-white border rounded-xl p-4 ${cancelled ? 'border-slate-200 opacity-60' : dirty ? 'border-indigo-300' : 'border-slate-200'}`}>
            <div className="flex flex-wrap items-start gap-3 mb-3">
                <div className="flex-1 min-w-[220px]">
                    <p className="font-black text-slate-800">
                        Line {line.line_no} · <Link to={`/v3/styles/${line.style_id}`} className="text-indigo-700 hover:underline">{line.style_code}</Link>
                        <span className="font-normal text-slate-500"> {line.style_name}</span>
                    </p>
                    <p className="text-xs text-slate-500">
                        BOM <Link to={`/v3/boms/${line.bom_id}`} className="font-semibold text-indigo-700 hover:underline">v{line.bom_version}</Link>
                        {cancelled && <span className="ml-2 font-bold text-rose-700">Cancelled: {line.cancelled_reason}</span>}
                    </p>
                </div>
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
                    <AlertTriangle size={13} /> BOM v{line.current_bom_version} has been approved since.
                    {editable && !needsReason ? ` Saving this line moves it to v${line.current_bom_version}.` : ` This line stays on v${line.bom_version} unless a merchandiser moves it.`}
                    {onMoveBom && <button type="button" onClick={onMoveBom} className="ml-2 inline-flex items-center gap-1 text-indigo-700 underline"><RefreshCw size={12} /> Move to v{line.current_bom_version}</button>}
                </p>
            )}
            {line.stray_qty > 0 && (
                <p className="mb-2 text-xs font-semibold text-rose-700 flex items-center gap-1">
                    <AlertTriangle size={13} /> {line.stray_qty} quantity cell(s) are for a colour or size this style / BOM no longer has.{editable ? ' Saving the line drops them.' : ''}
                </p>
            )}

            {line.colours.length === 0 || line.sizes.length === 0 ? (
                <p className="text-sm text-amber-700">This style's BOM has no colours or the style has no sizes.</p>
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
                            {line.colours.map((c, ri) => (
                                <tr key={c.garment_colour_id} className="border-t border-slate-100">
                                    <td className="px-2 py-1 font-semibold text-slate-700">{c.name}{!c.is_active && <span className="ml-1 text-[10px] font-bold text-rose-600">inactive</span>}</td>
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
                        disabled={saving || (needsReason ? (!dirty || !reason.trim()) : (!dirty && !line.bom_outdated && !line.stray_qty))}>
                        {needsReason ? 'Save revision' : 'Save line'}
                    </PrimaryButton>
                </div>
            ) : line.notes ? <p className="mt-2 text-xs text-slate-500">{line.notes}</p> : null}
            {dirty && <p className="mt-1 text-[11px] font-bold text-indigo-700">Unsaved changes{needsReason ? ' — this order is approved, so saving creates a new revision' : ''}. Tip: paste a block copied from Excel into any cell.</p>}
            <div className="mt-2"><ErrorBox text={error} /></div>
        </div>
    );
}

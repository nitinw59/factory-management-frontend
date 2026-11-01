// Reconciliation drill-down (31 Oct 2026, owner: "can we add drill down on each calculation in reconcilation with flagged
// warnings" → "build all"). A figure opens the rows behind it — per roll, end bit, issue slip, piece, garment or kit line —
// each with its own working, a Total row equal to the figure, flags (warn / info) and links to where it came from. The rows
// are the report's own (kept when it was generated); a report from before shows today's rows, said so.
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Info } from 'lucide-react';
import Modal from '../../shared/Modal';
import { SecondaryButton, SearchInput } from '../components/ui';
import { fmt, when } from './recShared';

const linkOf = (l) => (!l ? null : l.batch_id ? `/v3/cutting/batches/${l.batch_id}` : l.issue_id ? `/v3/material-issue/issues/${l.issue_id}` : l.kit_id ? `/v3/trim-kits/${l.kit_id}` : null);
const isWarn = (x) => x.flags?.some(f => f.level === 'warn');
const PAGE = 300;

// How many warn-flagged rows a figure has (for the dot on the cell).
export const flaggedIn = (detail, section, col) => (detail?.sections?.[section]?.cells?.[col] || []).reduce((a, t) => a + (t.flagged || 0), 0);
export const hasCell = (detail, section, col) => Boolean(detail?.sections?.[section]?.cells?.[col]?.length);

// A figure that opens its drill-down; a red dot when rows behind it are flagged.
export function Drill({ detail, section, col, onOpen, children, className = '' }) {
    if (!hasCell(detail, section, col)) return children;
    const n = flaggedIn(detail, section, col);
    return (
        <button type="button" onClick={() => onOpen(section, col)} title={n ? `${n} flagged — open the rows behind this` : 'Open the rows behind this'}
            className={`tabular-nums underline decoration-dotted decoration-slate-400 underline-offset-2 hover:text-indigo-700 hover:decoration-indigo-500 print:no-underline ${className}`}>
            {children}{n > 0 && <span className="ml-0.5 inline-block w-1.5 h-1.5 rounded-full bg-rose-500 align-top print:hidden" aria-label={`${n} flagged`} />}
        </button>
    );
}

function DrillTable({ t }) {
    const [q, setQ] = useState('');
    const [onlyFlagged, setOnlyFlagged] = useState(t.startFlagged && t.flagged > 0);
    const [all, setAll] = useState(false);
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const rows = useMemo(() => t.rows.filter(x => (!onlyFlagged || isWarn(x)) && (!words.length || words.every(w => t.columns.some(c => String(x[c.k] ?? '').toLowerCase().includes(w)) || (x.flags || []).some(f => f.text.toLowerCase().includes(w))))), [t, onlyFlagged, q]);   // eslint-disable-line react-hooks/exhaustive-deps
    const shown = all ? rows : rows.slice(0, PAGE);
    const cell = (c, v) => (v == null || v === '' ? '—' : c.date ? when(v) : c.num ? fmt(v, c.d ?? 3) : String(v));
    const filtered = onlyFlagged || words.length > 0;
    return (
        <div className="mb-4">
            <p className="font-black text-slate-800">{t.title}</p>
            {t.formula && <p className="text-xs text-slate-600 mb-1">{t.formula}</p>}
            {(t.rows.length > 12 || t.flagged > 0) && (
                <div className="flex flex-wrap items-center gap-3 mb-1 print:hidden">
                    {t.rows.length > 12 && <div className="w-64"><SearchInput value={q} onChange={setQ} placeholder="Search these rows" /></div>}
                    {t.flagged > 0 && <label className="flex items-center gap-1.5 text-sm font-semibold text-rose-700"><input type="checkbox" className="w-4 h-4" checked={onlyFlagged} onChange={e => setOnlyFlagged(e.target.checked)} /> Flagged only ({t.flagged})</label>}
                    <span className="text-xs text-slate-500">{rows.length} of {t.rows.length} row{t.rows.length === 1 ? '' : 's'}</span>
                </div>
            )}
            {t.rows.length === 0 ? <p className="text-sm text-slate-400">None.</p> : (
                <div className="overflow-x-auto border border-slate-200 rounded-lg">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50 text-[11px] font-bold text-slate-500 uppercase tracking-wide"><tr>
                            {t.columns.map(c => <th key={c.k} className={`px-2 py-1.5 ${c.num ? 'text-right' : 'text-left'} whitespace-nowrap`}>{c.l}</th>)}<th className="px-2 py-1.5" /></tr></thead>
                        <tbody>{shown.map((x, i) => {
                            const to = linkOf(x.link);
                            return [
                                <tr key={i} className={`border-t border-slate-100 align-top ${isWarn(x) ? 'bg-rose-50/70' : ''}`}>
                                    {t.columns.map(c => <td key={c.k} className={`px-2 py-1 ${c.num ? 'text-right tabular-nums' : ''} ${c.k === t.columns[0].k ? 'font-semibold text-slate-800' : 'text-slate-700'} whitespace-nowrap`}>{cell(c, x[c.k])}</td>)}
                                    <td className="px-2 py-1 text-right whitespace-nowrap">{to && <Link to={to} className="text-xs font-bold text-indigo-700 hover:underline print:hidden">Open</Link>}</td>
                                </tr>,
                                x.flags?.length > 0 && <tr key={`${i}f`} className={isWarn(x) ? 'bg-rose-50/70' : ''}><td colSpan={t.columns.length + 1} className="px-2 pb-1">
                                    {x.flags.map((f, j) => <span key={j} className={`inline-flex items-center gap-1 mr-3 text-[11px] font-semibold ${f.level === 'warn' ? 'text-rose-700' : 'text-slate-500'}`}>{f.level === 'warn' ? <AlertTriangle size={11} /> : <Info size={11} />}{f.text}</span>)}
                                </td></tr>,
                            ];
                        })}</tbody>
                        {t.total && !filtered && (
                            <tfoot><tr className="border-t-2 border-slate-300 bg-slate-50 font-black">
                                {t.columns.map((c, i) => <td key={c.k} className={`px-2 py-1.5 ${c.num ? 'text-right tabular-nums' : ''} whitespace-nowrap`}>{t.total[c.k] != null ? cell(c, t.total[c.k]) : i === 0 ? 'Total' : ''}</td>)}<td />
                            </tr></tfoot>
                        )}
                    </table>
                </div>
            )}
            {!all && rows.length > PAGE && <button type="button" className="mt-1 text-xs font-bold text-indigo-700 hover:underline" onClick={() => setAll(true)}>Show all {rows.length} rows</button>}
            {filtered && t.total && <p className="text-xs text-slate-500 mt-1">Total shown with every row — clear the filter to see it.</p>}
            {t.note && <p className="text-xs text-slate-500 mt-1">{t.note}</p>}
        </div>
    );
}

// The panel: one figure's tables. startFlagged: opened from a warning — flagged rows first.
export function DrillPanel({ detail, open, onClose }) {
    const sec = detail?.sections?.[open.section];
    const tables = sec?.cells?.[open.col] || [];
    return (
        <Modal title={`${sec?.label && open.section !== 'stage' ? `${sec.label} · ` : ''}${open.title}`} onClose={onClose}>
            <div className="w-[min(1100px,94vw)] max-h-[78vh] overflow-y-auto pr-1">
                {detail?.live && <p className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"><b>Today's rows</b> — this report was generated before the rows behind it were kept, so these are worked out now ({when(detail.live_at)}) and may differ from its figures. Generate it again to keep them with the report.</p>}
                {tables.length === 0 ? <p className="text-sm text-slate-500">Nothing behind this figure.</p> : tables.map((t, i) => <DrillTable key={`${open.section}|${open.col}|${i}`} t={{ ...t, startFlagged: open.flagged }} />)}
                <div className="flex justify-end"><SecondaryButton onClick={onClose}>Close</SecondaryButton></div>
            </div>
        </Modal>
    );
}

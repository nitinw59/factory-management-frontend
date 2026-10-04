// Shown when the approver clicks Approve: readiness, and what changed against
// the style's current approved version (colours, tones, lines, item swaps).
import { useEffect, useState } from 'react';
import { CheckCircle2, AlertTriangle } from 'lucide-react';
import Modal from '../../shared/Modal';
import { stylesApi } from '../api/stylesApi';
import { apiError } from '../api/mastersApi';
import { PrimaryButton, SecondaryButton, ErrorBox, Loading } from '../components/ui';
import { ProblemList } from './TrimCardTab';

const Block = ({ title, children }) => (
    <div>
        <p className="text-xs font-black uppercase tracking-wide text-slate-500 mb-1">{title}</p>
        {children}
    </div>
);

export default function ApprovalPreviewModal({ bomId, busy, onApprove, onClose }) {
    const [p, setP] = useState(null);
    const [error, setError] = useState('');

    useEffect(() => {
        stylesApi.approvalPreview(bomId).then(res => setP(res.data)).catch(err => setError(apiError(err, 'Failed to load the preview.')));
    }, [bomId]);

    const d = p?.diff;
    const nothingChanged = d && !d.colours_added.length && !d.colours_removed.length && !d.tone_changes.length
        && !d.lines_added.length && !d.lines_removed.length && !d.lines_changed.length && !d.item_changes.length;

    return (
        <Modal title="Approve BOM — preview" onClose={onClose}>
            <div className="space-y-4 w-[min(760px,90vw)] max-h-[75vh] overflow-y-auto pr-1">
                {!p ? (error ? <ErrorBox text={error} /> : <Loading />) : <>
                    <p className="text-sm text-slate-600">
                        <b>{p.bom.style_code} · v{p.bom.version_no}</b> — {p.summary.colours} colour(s), {p.summary.sizes} size(s), {p.summary.fabric_lines} fabric line(s), {p.summary.trim_lines} trim line(s).
                    </p>
                    {p.ready ? (
                        <p className="flex items-center gap-1.5 text-sm font-bold text-emerald-700"><CheckCircle2 size={16} /> Every colour and size resolves to one active item.</p>
                    ) : (
                        <div className="bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                            <p className="flex items-center gap-1.5 text-sm font-bold text-rose-800 mb-1"><AlertTriangle size={15} /> Can't approve: {p.problems.length} problem(s). Reject it with a reason so it gets fixed.</p>
                            <ProblemList problems={p.problems} max={10} />
                        </div>
                    )}
                    {p.warnings.map((w, i) => <p key={i} className="text-xs font-semibold text-amber-700">{w}</p>)}

                    {!p.against ? (
                        <p className="text-sm text-slate-500">First approved version of this style — nothing to compare against.</p>
                    ) : (
                        <div className="space-y-3 border border-slate-200 rounded-lg p-3">
                            <p className="text-sm font-bold text-slate-700">Changes against the approved version {p.against.version_no} (which will be archived)</p>
                            {nothingChanged && <p className="text-sm text-slate-500">No changes.</p>}
                            {(d.colours_added.length > 0 || d.colours_removed.length > 0) && (
                                <Block title="Colours">
                                    {d.colours_added.length > 0 && <p className="text-sm text-emerald-700">+ {d.colours_added.join(', ')}</p>}
                                    {d.colours_removed.length > 0 && <p className="text-sm text-rose-700">− {d.colours_removed.join(', ')}</p>}
                                </Block>
                            )}
                            {d.tone_changes.length > 0 && (
                                <Block title="Tones">
                                    {d.tone_changes.map((t, i) => <p key={i} className="text-sm">{t.colour}: {t.from} → <b>{t.to}</b></p>)}
                                </Block>
                            )}
                            {(d.lines_added.length > 0 || d.lines_removed.length > 0) && (
                                <Block title="Lines">
                                    {d.lines_added.map((l, i) => <p key={`a${i}`} className="text-sm text-emerald-700">+ {l}</p>)}
                                    {d.lines_removed.map((l, i) => <p key={`r${i}`} className="text-sm text-rose-700">− {l}</p>)}
                                </Block>
                            )}
                            {d.lines_changed.length > 0 && (
                                <Block title="Line changes">
                                    {d.lines_changed.map((l, i) => (
                                        <div key={i} className="text-sm mb-1">
                                            <b>{l.line}</b>
                                            {l.changes.map((c, j) => <p key={j} className="pl-3 text-slate-600">{c.field}: {String(c.from)} → <b className="text-slate-800">{String(c.to)}</b></p>)}
                                        </div>
                                    ))}
                                </Block>
                            )}
                            {d.item_changes.length > 0 && (
                                <Block title="Items swapped">
                                    <table className="w-full text-xs border-collapse">
                                        <thead><tr className="text-left text-slate-500"><th className="py-1 pr-2">Line</th><th className="py-1 pr-2">Colour</th><th className="py-1 pr-2">Was</th><th className="py-1">Now</th></tr></thead>
                                        <tbody>
                                            {d.item_changes.map((x, i) => (
                                                <tr key={i} className="border-t border-slate-100 align-top">
                                                    <td className="py-1 pr-2 font-semibold">{x.line}</td><td className="py-1 pr-2">{x.colour}</td>
                                                    <td className="py-1 pr-2 text-rose-700">{x.from}</td><td className="py-1 text-emerald-700">{x.to}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </Block>
                            )}
                        </div>
                    )}
                    <Block title="Orders using this style">
                        <p className="text-sm text-slate-500">{p.orders.length ? `${p.orders.length} order(s)` : 'None — 3.0 sales orders come in a later phase.'}</p>
                    </Block>
                </>}
                <ErrorBox text={p ? error : ''} />
                <div className="flex justify-end gap-2">
                    <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
                    <PrimaryButton onClick={onApprove} busy={busy} disabled={busy || !p || !p.ready}><CheckCircle2 size={14} /> Approve</PrimaryButton>
                </div>
            </div>
        </Modal>
    );
}

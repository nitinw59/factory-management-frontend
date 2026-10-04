// One BOM version: status + actions (submit / withdraw / approve / reject /
// archive / new version / delete draft) and Colours / Lines / History tabs.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Send, Undo2, CheckCircle2, XCircle, Archive, Copy, Trash2 } from 'lucide-react';
import Modal from '../../shared/Modal';
import { stylesApi } from '../api/stylesApi';
import { mastersApi, apiError } from '../api/mastersApi';
import { Field, inputCls, PrimaryButton, SecondaryButton, ErrorBox, Loading, SearchInput } from '../components/ui';
import BomStatusBadge from './BomStatusBadge';
import BomLinesTab from './BomLinesTab';
import TrimCardTab from './TrimCardTab';
import ApprovalPreviewModal from './ApprovalPreviewModal';

const EDITABLE = ['DRAFT', 'REJECTED'];
const TABS = [{ key: 'colours', label: 'Colours' }, { key: 'lines', label: 'Lines' }, { key: 'card', label: 'Trim card' }, { key: 'history', label: 'History' }];

export default function BomPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [bom, setBom] = useState(null);
    const [perms, setPerms] = useState({ bomEdit: false, bomApprove: false });
    const [allColours, setAllColours] = useState([]);
    const [tones, setTones] = useState([]);
    const [tab, setTab] = useState('colours');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [rejecting, setRejecting] = useState(null); // reason text
    const [approving, setApproving] = useState(false);
    // Colours tab working copy: colour id → override tone id ('' = none)
    const [picked, setPicked] = useState(new Map());
    const [search, setSearch] = useState('');
    const [notes, setNotes] = useState('');

    const apply = useCallback((b) => {
        setBom(b);
        setPicked(new Map(b.colours.map(c => [String(c.garment_colour_id), c.override_tone_id ? String(c.override_tone_id) : ''])));
        setNotes(b.notes || '');
    }, []);

    useEffect(() => {
        Promise.all([stylesApi.bom(id), mastersApi.garmentColours(), mastersApi.toneGroups()])
            .then(([b, c, t]) => { apply(b.data); setAllColours(c.data); setTones(t.data.filter(x => x.is_active)); })
            .catch(err => setError(apiError(err, 'Failed to load the BOM.')));
        stylesApi.permissions().then(res => setPerms(res.data)).catch(() => {});
    }, [id, apply]);

    const editable = bom && EDITABLE.includes(bom.status) && perms.bomEdit;
    const coloursDirty = bom && JSON.stringify([...picked.entries()].sort()) !== JSON.stringify(bom.colours.map(c => [String(c.garment_colour_id), c.override_tone_id ? String(c.override_tone_id) : '']).sort());
    const notesDirty = bom && notes !== (bom.notes || '');

    const shownColours = useMemo(() => {
        const q = search.trim().toLowerCase();
        // active colours, plus any picked colour that has since gone inactive
        return allColours.filter(c => (c.is_active || picked.has(String(c.id))) && (!q || c.name.toLowerCase().includes(q)));
    }, [allColours, picked, search]);

    const run = async (fn, after) => {
        setBusy(true); setError('');
        try {
            const res = await fn();
            if (after) after(res); else apply(res.data);
        } catch (err) {
            setError(apiError(err, 'Action failed.'));
            // Unresolved lines: the trim card lists each one.
            if (err?.response?.data?.problems) setTab('card');
        } finally {
            setBusy(false);
        }
    };

    if (!bom) return <div>{error ? <ErrorBox text={error} /> : <Loading />}</div>;

    const saveColours = () => run(() => stylesApi.setBomColours(id, [...picked.entries()].map(([cid, tone]) => ({ garment_colour_id: cid, tone_group_id: tone || null }))));
    const saveNotes = () => run(() => stylesApi.updateBom(id, { notes }));

    return (
        <div>
            <Link to={`/v3/styles/${bom.style_id}`} className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-indigo-600 mb-3"><ArrowLeft size={15} /> {bom.style_code}</Link>
            <div className="flex flex-wrap items-center gap-3 mb-2">
                <h1 className="text-2xl font-black text-slate-900">{bom.style_code} · BOM v{bom.version_no}</h1>
                <BomStatusBadge status={bom.status} />
                <span className="text-sm text-slate-500">{bom.style_name}</span>
            </div>
            {bom.status === 'REJECTED' && bom.rejected_reason && (
                <div className="mb-3 text-sm bg-rose-50 border border-rose-200 text-rose-800 rounded-lg px-3 py-2"><b>Rejected:</b> {bom.rejected_reason}. Fix it, then submit again.</div>
            )}
            {bom.status === 'APPROVED' && <p className="text-sm text-emerald-700 mb-3">Approved {bom.approved_at ? new Date(bom.approved_at).toLocaleString() : ''}{bom.approved_by_name ? ` by ${bom.approved_by_name}` : ''}. Read-only; changes go into a new version.</p>}

            {/* Actions for this status and the signed-in user's rights */}
            <div className="flex flex-wrap gap-2 mb-4">
                {editable && <PrimaryButton onClick={() => run(() => stylesApi.submitBom(id))} busy={busy} disabled={busy || coloursDirty || notesDirty}><Send size={14} /> Submit for approval</PrimaryButton>}
                {perms.bomEdit && bom.status === 'PENDING_APPROVAL' && <SecondaryButton onClick={() => run(() => stylesApi.withdrawBom(id))} disabled={busy}><Undo2 size={14} /> Withdraw</SecondaryButton>}
                {perms.bomApprove && bom.status === 'PENDING_APPROVAL' && <>
                    <PrimaryButton onClick={() => setApproving(true)} disabled={busy}><CheckCircle2 size={14} /> Approve…</PrimaryButton>
                    <SecondaryButton onClick={() => setRejecting('')} disabled={busy}><XCircle size={14} /> Reject</SecondaryButton>
                </>}
                {perms.bomApprove && bom.status === 'APPROVED' && <SecondaryButton onClick={() => { if (window.confirm('Archive this approved BOM? The style will have no approved BOM until another version is approved.')) run(() => stylesApi.archiveBom(id, 'Archived')); }} disabled={busy}><Archive size={14} /> Archive</SecondaryButton>}
                {perms.bomEdit && <SecondaryButton onClick={() => run(() => stylesApi.createBom(bom.style_id, bom.id), (res) => navigate(`/v3/boms/${res.data.id}`))} disabled={busy}><Copy size={14} /> New version from this</SecondaryButton>}
                {perms.bomEdit && bom.status === 'DRAFT' && !bom.submitted_at && <SecondaryButton onClick={() => { if (window.confirm('Delete this draft?')) run(() => stylesApi.deleteBom(id), () => navigate(`/v3/styles/${bom.style_id}`)); }} disabled={busy}><Trash2 size={14} /> Delete draft</SecondaryButton>}
            </div>
            {editable && (coloursDirty || notesDirty) && <p className="text-xs font-bold text-amber-700 mb-2">Save your changes before submitting.</p>}
            <ErrorBox text={error} />

            <div className="flex gap-1 border-b border-slate-200 mb-4 mt-3">
                {TABS.map(t => (
                    <button key={t.key} type="button" onClick={() => setTab(t.key)}
                        className={`px-4 py-2 text-sm font-bold border-b-2 -mb-px ${tab === t.key ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
                        {t.label}{t.key === 'colours' ? ` (${bom.colours.length})` : ''}{t.key === 'colours' && coloursDirty ? ' •' : ''}
                    </button>
                ))}
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4">
                {tab === 'colours' && (
                    <div>
                        <div className="flex flex-wrap items-center gap-2 mb-3">
                            <p className="text-sm text-slate-500 flex-1 min-w-[240px]">Garment colours this BOM is for. Optionally override a colour's tone for this style only (e.g. grey counts as Dark).</p>
                            <SearchInput value={search} onChange={setSearch} placeholder="Search colours" />
                        </div>
                        <div className="divide-y divide-slate-100 max-h-[55vh] overflow-y-auto border border-slate-100 rounded-lg">
                            {shownColours.length === 0 && <p className="p-4 text-sm text-slate-400">No garment colours. Add them under Masters → Garment colours.</p>}
                            {shownColours.map(c => {
                                const cid = String(c.id);
                                const on = picked.has(cid);
                                return (
                                    <div key={c.id} className={`flex flex-wrap items-center gap-3 px-3 py-2 ${on ? 'bg-indigo-50/40' : ''}`}>
                                        <label className="flex items-center gap-2 flex-1 min-w-[180px] text-sm font-semibold text-slate-800">
                                            <input type="checkbox" disabled={!editable} checked={on}
                                                onChange={e => setPicked(m => { const n = new Map(m); if (e.target.checked) n.set(cid, ''); else n.delete(cid); return n; })} />
                                            {c.name}
                                            {!c.is_active && <span className="text-[11px] font-bold text-rose-600">inactive</span>}
                                        </label>
                                        <span className="text-xs text-slate-500 w-32">tone: {c.tone_name || <span className="font-bold text-amber-600">not set</span>}</span>
                                        {on && (
                                            <select className={`${inputCls} w-48`} disabled={!editable} value={picked.get(cid)}
                                                onChange={e => setPicked(m => new Map(m).set(cid, e.target.value))} aria-label={`Tone override for ${c.name}`}>
                                                <option value="">No override</option>
                                                {tones.map(t => <option key={t.id} value={t.id}>Override: {t.name}</option>)}
                                            </select>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                        {editable && (
                            <div className="flex items-center gap-2 pt-3">
                                <PrimaryButton onClick={saveColours} busy={busy} disabled={busy || !coloursDirty}>Save colours</PrimaryButton>
                                {coloursDirty && <span className="text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">Unsaved changes</span>}
                            </div>
                        )}
                        <div className="mt-5 max-w-2xl">
                            <Field label="Notes">
                                <textarea className={`${inputCls} min-h-[70px]`} disabled={!editable} value={notes} onChange={e => setNotes(e.target.value)} />
                            </Field>
                            {editable && notesDirty && <div className="pt-2"><SecondaryButton onClick={saveNotes} disabled={busy}>Save notes</SecondaryButton></div>}
                        </div>
                    </div>
                )}

                {tab === 'lines' && (
                    <BomLinesTab bom={bom} editable={editable} tones={tones} />
                )}

                {tab === 'card' && <TrimCardTab bomId={id} refreshKey={bom.updated_at} />}

                {tab === 'history' && (
                    <div className="divide-y divide-slate-100">
                        {bom.history.map(h => (
                            <div key={h.id} className="py-2 flex flex-wrap items-center gap-2 text-sm">
                                <span className="text-xs text-slate-400 w-40">{new Date(h.created_at).toLocaleString()}</span>
                                {h.from_status && <><BomStatusBadge status={h.from_status} /><span className="text-slate-400">→</span></>}
                                <BomStatusBadge status={h.to_status} />
                                <span className="text-slate-600">{h.user_name || ''}</span>
                                {h.reason && <span className="text-slate-500">— {h.reason}</span>}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {approving && (
                <ApprovalPreviewModal bomId={id} busy={busy} onClose={() => setApproving(false)}
                    onApprove={async () => { await run(() => stylesApi.approveBom(id)); setApproving(false); }} />
            )}

            {rejecting !== null && (
                <Modal title="Reject BOM" onClose={() => setRejecting(null)}>
                    <div className="space-y-3 w-[min(460px,85vw)]">
                        <Field label="Reason *" hint="The merchandiser sees this and fixes the BOM.">
                            <textarea className={`${inputCls} min-h-[90px]`} value={rejecting} onChange={e => setRejecting(e.target.value)} autoFocus />
                        </Field>
                        <div className="flex justify-end gap-2">
                            <SecondaryButton onClick={() => setRejecting(null)}>Cancel</SecondaryButton>
                            <PrimaryButton onClick={() => run(() => stylesApi.rejectBom(id, rejecting), (res) => { apply(res.data); setRejecting(null); })} busy={busy} disabled={busy || !rejecting.trim()}>Reject</PrimaryButton>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
}

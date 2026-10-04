// Trim settings: tone groups (configurable, seeded Dark / Light) and each
// garment colour's tone. The only place a colour's tone is edited; a style can
// override it on its BOM (later phase).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Pencil, Check } from 'lucide-react';
import Modal from '../../shared/Modal';
import { mastersApi, apiError } from '../api/mastersApi';
import { PageHeader, SearchInput, Field, inputCls, PrimaryButton, SecondaryButton, ErrorBox, ActiveBadge, Loading, useMastersPermissions } from '../components/ui';

export default function TrimSettingsPage() {
    const perms = useMastersPermissions();
    const [tones, setTones] = useState(null);
    const [colours, setColours] = useState(null);
    const [error, setError] = useState('');
    const [search, setSearch] = useState('');
    const [onlyUnset, setOnlyUnset] = useState(false);
    const [editingTone, setEditingTone] = useState(null);
    const [toneError, setToneError] = useState('');
    const [savingTone, setSavingTone] = useState(false);
    const [savedId, setSavedId] = useState(null); // flashes a tick after a colour's tone is saved

    const load = useCallback(() => {
        Promise.all([mastersApi.toneGroups(), mastersApi.garmentColours()])
            .then(([t, c]) => { setTones(t.data); setColours(c.data); })
            .catch(err => setError(apiError(err, 'Failed to load trim settings.')));
    }, []);
    useEffect(() => { load(); }, [load]);

    const activeTones = (tones || []).filter(t => t.is_active);
    const unsetCount = (colours || []).filter(c => c.is_active && !c.tone_group_id).length;
    const shown = useMemo(() => {
        const q = search.trim().toLowerCase();
        return (colours || []).filter(c => c.is_active && (!onlyUnset || !c.tone_group_id) && (!q || c.name.toLowerCase().includes(q)));
    }, [colours, search, onlyUnset]);

    const setTone = async (colour, toneId) => {
        setError('');
        try {
            await mastersApi.setGarmentColourTone(colour.id, toneId || null);
            const tone = (tones || []).find(t => String(t.id) === String(toneId));
            setColours(cs => cs.map(c => c.id === colour.id ? { ...c, tone_group_id: toneId || null, tone_name: tone?.name || null } : c));
            setSavedId(colour.id);
            setTimeout(() => setSavedId(id => (id === colour.id ? null : id)), 1500);
        } catch (err) {
            setError(apiError(err, `Failed to set the tone of ${colour.name}.`));
        }
    };

    const saveTone = async () => {
        setSavingTone(true); setToneError('');
        try {
            if (editingTone.id) await mastersApi.updateToneGroup(editingTone.id, editingTone);
            else await mastersApi.createToneGroup(editingTone);
            setEditingTone(null); load();
        } catch (err) {
            setToneError(apiError(err, 'Failed to save.'));
        } finally {
            setSavingTone(false);
        }
    };

    if (!tones || !colours) return <div><PageHeader title="Trim settings" /><ErrorBox text={error} />{!error && <Loading />}</div>;

    return (
        <div className="space-y-6">
            <PageHeader title="Trim settings" subtitle="Tones decide which trim a BY_TONE BOM line uses (e.g. dark garments → black fusing)." />
            <ErrorBox text={error} />

            <section className="bg-white border border-slate-200 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                    <h2 className="font-bold text-slate-800">Tone groups</h2>
                    {perms.colours && <span className="ml-auto"><SecondaryButton onClick={() => { setToneError(''); setEditingTone({ name: '', sort_order: tones.length + 1, is_active: true }); }}><Plus size={14} /> Add tone</SecondaryButton></span>}
                </div>
                <div className="flex flex-wrap gap-2">
                    {tones.map(t => (
                        <div key={t.id} className="flex items-center gap-2 border border-slate-200 rounded-lg px-3 py-2">
                            <span className="font-semibold text-slate-800">{t.name}</span>
                            <span className="text-xs text-slate-400">{t.colour_count} colour{t.colour_count !== 1 ? 's' : ''}</span>
                            <ActiveBadge active={t.is_active} />
                            {perms.colours && <button type="button" onClick={() => { setToneError(''); setEditingTone({ ...t }); }} className="p-1 rounded text-slate-500 hover:bg-slate-100" aria-label={`Edit ${t.name}`}><Pencil size={14} /></button>}
                        </div>
                    ))}
                </div>
            </section>

            <section className="bg-white border border-slate-200 rounded-xl p-4">
                <div className="flex flex-wrap items-center gap-3 mb-3">
                    <h2 className="font-bold text-slate-800">Colour tones</h2>
                    {unsetCount > 0 && <span className="text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">{unsetCount} colour{unsetCount !== 1 ? 's' : ''} without a tone</span>}
                    <label className="flex items-center gap-1.5 text-sm text-slate-600 ml-auto"><input type="checkbox" checked={onlyUnset} onChange={e => setOnlyUnset(e.target.checked)} /> Only without a tone</label>
                    <SearchInput value={search} onChange={setSearch} placeholder="Search colour" />
                </div>
                <div className="divide-y divide-slate-100">
                    {shown.length === 0 && <p className="py-6 text-center text-sm text-slate-400">No colours to show.</p>}
                    {shown.map(c => (
                        <div key={c.id} className="flex items-center gap-3 py-2">
                            <span className="flex-1 font-semibold text-slate-800">{c.name}</span>
                            {savedId === c.id && <span className="text-xs font-bold text-emerald-600 flex items-center gap-1"><Check size={13} /> Saved</span>}
                            <select
                                value={c.tone_group_id || ''}
                                disabled={!perms.colours}
                                onChange={e => setTone(c, e.target.value)}
                                className={`${inputCls} w-44`}
                                aria-label={`Tone of ${c.name}`}
                            >
                                <option value="">— not set —</option>
                                {activeTones.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                            </select>
                        </div>
                    ))}
                </div>
            </section>

            {editingTone && (
                <Modal title={editingTone.id ? 'Edit tone group' : 'Add tone group'} onClose={() => setEditingTone(null)}>
                    <div className="space-y-4 min-w-[300px]">
                        <Field label="Name *"><input className={inputCls} value={editingTone.name} onChange={e => setEditingTone({ ...editingTone, name: e.target.value })} autoFocus /></Field>
                        <Field label="Order" hint="Lower numbers are listed first."><input type="number" className={inputCls} value={editingTone.sort_order} onChange={e => setEditingTone({ ...editingTone, sort_order: e.target.value })} /></Field>
                        {editingTone.id && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={editingTone.is_active} onChange={e => setEditingTone({ ...editingTone, is_active: e.target.checked })} /> Active</label>}
                        <ErrorBox text={toneError} />
                        <div className="flex justify-end gap-2">
                            <SecondaryButton onClick={() => setEditingTone(null)}>Cancel</SecondaryButton>
                            <PrimaryButton onClick={saveTone} busy={savingTone} disabled={savingTone || !editingTone.name.trim()}>Save</PrimaryButton>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
}

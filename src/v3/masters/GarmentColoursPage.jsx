// Garment colours (v3.garment_colours). Tone is shown here but edited only in
// Trim settings (agreed in docs/TRIM_MANAGEMENT_PLAN.md).
// A colour is its name + buyer colour code + buyer (8 Nov 2026): two "LT GREY" may exist when the code or the buyer
// differs, and every screen shows "LT GREY · VESPER BLUE". Buyer blank = a common colour for every buyer; an order
// offers only its buyer's colours and the common ones. Once a colour is on an approved Style BOM its name, code and
// buyer are locked (the factory admin corrects them with a reason); a common colour may still be given its buyer.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Pencil, Lock, Wand2 } from 'lucide-react';
import Modal from '../../shared/Modal';
import { mastersApi, apiError } from '../api/mastersApi';
import { salesOrdersApi } from '../api/salesOrdersApi';
import { PageHeader, SearchInput, Field, inputCls, PrimaryButton, SecondaryButton, ErrorBox, ActiveBadge, Loading, useMastersPermissions } from '../components/ui';

const empty = { name: '', buyer_colour_code: '', customer_id: '', is_active: true, reason: '' };

export default function GarmentColoursPage() {
    const perms = useMastersPermissions();
    const [rows, setRows] = useState(null);
    const [customers, setCustomers] = useState([]);
    const [search, setSearch] = useState('');
    const [buyer, setBuyer] = useState('');   // '' all · 'common' · customer id
    const [error, setError] = useState('');
    const [editing, setEditing] = useState(null); // {id?, ...fields, original}
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState('');
    const [applying, setApplying] = useState(null);   // the suggestions being reviewed

    const load = useCallback(() => {
        mastersApi.garmentColours().then(res => setRows(res.data)).catch(err => setError(apiError(err, 'Failed to load colours.')));
    }, []);
    useEffect(() => { load(); }, [load]);
    useEffect(() => {
        if (perms.colours) salesOrdersApi.customers().then(res => setCustomers(res.data || [])).catch(() => setCustomers([]));
    }, [perms.colours]);

    // Buyer filter: the buyers on colours (and in the customer list when it could be loaded).
    const buyers = useMemo(() => {
        const m = new Map((rows || []).filter(r => r.customer_id).map(r => [String(r.customer_id), r.customer_name]));
        return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
    }, [rows]);
    const shown = useMemo(() => {
        const q = search.trim().toLowerCase();
        return (rows || []).filter(r => (!q || r.name.toLowerCase().includes(q) || (r.buyer_colour_code || '').toLowerCase().includes(q) || (r.customer_name || '').toLowerCase().includes(q))
            && (!buyer || (buyer === 'common' ? !r.customer_id : String(r.customer_id) === buyer)));
    }, [rows, search, buyer]);
    const suggestions = useMemo(() => (rows || []).filter(r => !r.customer_id && r.suggested_customer_id), [rows]);
    const sameName = useMemo(() => {
        const n = new Map();
        for (const r of rows || []) { const k = r.name.trim().toLowerCase(); n.set(k, (n.get(k) || 0) + 1); }
        return n;
    }, [rows]);

    const payloadOf = (e) => ({ name: e.name, buyer_colour_code: e.buyer_colour_code, customer_id: e.customer_id || null, tone_group_id: e.tone_group_id ?? null, is_active: e.is_active, ...(e.reason?.trim() && { reason: e.reason.trim() }) });
    const save = async () => {
        setSaving(true); setFormError('');
        try {
            if (editing.id) await mastersApi.updateGarmentColour(editing.id, payloadOf(editing));
            else await mastersApi.createGarmentColour(payloadOf(editing));
            setEditing(null); load();
        } catch (err) {
            setFormError(apiError(err, 'Failed to save.'));
        } finally {
            setSaving(false);
        }
    };
    const applyAll = async () => {
        setSaving(true); setFormError('');
        const failed = [];
        for (const r of applying) {
            try { await mastersApi.updateGarmentColour(r.id, payloadOf({ ...r, customer_id: r.suggested_customer_id, buyer_colour_code: r.buyer_colour_code || '' })); }
            catch (err) { failed.push(`${r.label}: ${apiError(err, 'failed')}`); }
        }
        setSaving(false);
        if (failed.length) setFormError(failed.join(' · ')); else setApplying(null);
        load();
    };

    const open = (r) => { setFormError(''); setEditing(r ? { ...r, buyer_colour_code: r.buyer_colour_code || '', customer_id: r.customer_id ? String(r.customer_id) : '', reason: '', original: r } : { ...empty }); };
    const o = editing?.original;
    // Locked identity changed: name / code, or the buyer changed away from one that was set.
    const lockedChange = !!(o?.locked && (editing.name.trim() !== o.name || editing.buyer_colour_code.trim() !== (o.buyer_colour_code || '')
        || (o.customer_id && String(o.customer_id) !== (editing.customer_id || ''))));
    const activeCount = shown.filter(r => r.is_active).length;

    return (
        <div>
            <PageHeader
                title="Garment colours"
                subtitle="A colour is its name + buyer colour code + buyer. The same name may repeat when the code or the buyer differs."
                actions={<>
                    <SearchInput value={search} onChange={setSearch} placeholder="Search name, code or buyer" />
                    <select className={`${inputCls} !w-auto`} value={buyer} onChange={e => setBuyer(e.target.value)} aria-label="Buyer">
                        <option value="">All buyers</option>
                        <option value="common">Common (all buyers)</option>
                        {buyers.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                    </select>
                    {perms.colours && suggestions.length > 0 && <SecondaryButton onClick={() => { setFormError(''); setApplying(suggestions); }}><Wand2 size={15} /> Review {suggestions.length} suggested buyer{suggestions.length === 1 ? '' : 's'}</SecondaryButton>}
                    {perms.colours && <PrimaryButton onClick={() => open(null)}><Plus size={15} /> Add colour</PrimaryButton>}
                </>}
            />
            <ErrorBox text={error} />
            {!rows ? <Loading /> : (
                <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                            <tr><th className="px-4 py-2.5">Colour</th><th className="px-4 py-2.5">Buyer code</th><th className="px-4 py-2.5">Buyer</th><th className="px-4 py-2.5">Tone</th><th className="px-4 py-2.5">Status</th><th className="px-4 py-2.5 w-16" /></tr>
                        </thead>
                        <tbody>
                            {shown.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">No colours{rows.length ? ' match.' : ' yet.'}</td></tr>}
                            {shown.map(r => (
                                <tr key={r.id} className="border-t border-slate-100">
                                    <td className="px-4 py-2.5 font-semibold text-slate-800">
                                        {r.name}
                                        {sameName.get(r.name.trim().toLowerCase()) > 1 && <span className="ml-1.5 text-[10px] font-bold text-amber-700" title="Another colour has the same name — told apart by its buyer code and buyer">same name ×{sameName.get(r.name.trim().toLowerCase())}</span>}
                                        {r.locked && <Lock size={11} className="inline ml-1.5 text-slate-400" aria-label="On an approved Style BOM" />}
                                    </td>
                                    <td className="px-4 py-2.5 text-slate-600">{r.buyer_colour_code || <span className="text-xs font-bold text-amber-600">Missing</span>}</td>
                                    <td className="px-4 py-2.5">
                                        {r.customer_name
                                            ? <span className="text-slate-700">{r.customer_name}</span>
                                            : <span className="text-xs text-slate-400">Common{r.suggested_customer_name ? <> · <span className="font-semibold text-indigo-700">suggested: {r.suggested_customer_name}</span></> : ''}</span>}
                                    </td>
                                    <td className="px-4 py-2.5">
                                        {r.tone_name
                                            ? <span className="text-xs font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700">{r.tone_name}</span>
                                            : <span className="text-xs font-bold text-amber-600">Not set</span>}
                                    </td>
                                    <td className="px-4 py-2.5"><ActiveBadge active={r.is_active} /></td>
                                    <td className="px-4 py-2.5 text-right">
                                        {perms.colours && (
                                            <button type="button" onClick={() => open(r)}
                                                className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100" aria-label={`Edit ${r.label}`}><Pencil size={15} /></button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot>
                            <tr className="border-t-2 border-slate-200 bg-slate-50 text-xs font-bold text-slate-600">
                                <td className="px-4 py-2">{shown.length} colour{shown.length === 1 ? '' : 's'}</td>
                                <td className="px-4 py-2">{shown.filter(r => !r.buyer_colour_code).length ? `${shown.filter(r => !r.buyer_colour_code).length} missing` : ''}</td>
                                <td className="px-4 py-2">{shown.filter(r => !r.customer_id).length} common · {shown.filter(r => r.customer_id).length} with a buyer</td>
                                <td className="px-4 py-2">{shown.filter(r => !r.tone_name).length ? `${shown.filter(r => !r.tone_name).length} not set` : ''}</td>
                                <td className="px-4 py-2" colSpan={2}>{activeCount} active</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            )}

            {editing && (
                <Modal title={editing.id ? 'Edit garment colour' : 'Add garment colour'} onClose={() => setEditing(null)}>
                    <div className="space-y-4 min-w-[340px] max-w-md">
                        {o?.locked && (
                            <p className="flex gap-1.5 text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2">
                                <Lock size={13} className="shrink-0 mt-0.5" />
                                On an approved Style BOM: name, buyer code and buyer are locked — past orders show this colour. Only the factory admin can correct them, with a reason. A common colour may still be given its buyer.
                            </p>
                        )}
                        <Field label="Colour name *"><input className={inputCls} value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} autoFocus /></Field>
                        <Field label="Buyer colour code *" hint="What the buyer calls it: their colour name, code or style no."><input className={inputCls} value={editing.buyer_colour_code} onChange={e => setEditing({ ...editing, buyer_colour_code: e.target.value })} /></Field>
                        <Field label="Buyer" hint="Blank = a common colour any buyer's order can use.">
                            <select className={inputCls} value={editing.customer_id} onChange={e => setEditing({ ...editing, customer_id: e.target.value })}>
                                <option value="">— Common (all buyers) —</option>
                                {editing.customer_id && !customers.some(c => String(c.id) === editing.customer_id) && <option value={editing.customer_id}>{o?.customer_name || `Buyer ${editing.customer_id}`}</option>}
                                {customers.map(c => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
                            </select>
                        </Field>
                        {o?.suggested_customer_name && !editing.customer_id && (
                            <button type="button" className="text-xs font-semibold text-indigo-700 underline" onClick={() => setEditing({ ...editing, customer_id: String(o.suggested_customer_id) })}>
                                Use the suggested buyer: {o.suggested_customer_name}
                            </button>
                        )}
                        {lockedChange && <Field label="Reason for the correction *"><input className={inputCls} value={editing.reason} onChange={e => setEditing({ ...editing, reason: e.target.value })} /></Field>}
                        <p className="text-xs text-slate-500">The tone (Dark / Light) is set in <Link to="/v3/masters/trim-settings" className="font-semibold text-indigo-600 underline">Trim settings</Link>.</p>
                        {editing.id && (
                            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={editing.is_active} onChange={e => setEditing({ ...editing, is_active: e.target.checked })} /> Active</label>
                        )}
                        <ErrorBox text={formError} />
                        <div className="flex justify-end gap-2 pt-2">
                            <SecondaryButton onClick={() => setEditing(null)}>Cancel</SecondaryButton>
                            <PrimaryButton onClick={save} busy={saving} disabled={saving || !editing.name.trim() || !editing.buyer_colour_code.trim() || (lockedChange && !editing.reason.trim())}>Save</PrimaryButton>
                        </div>
                    </div>
                </Modal>
            )}

            {applying && (
                <Modal title="Suggested buyers" onClose={() => setApplying(null)}>
                    <div className="space-y-3 min-w-[340px] max-w-lg">
                        <p className="text-xs text-slate-600">Every order using these colours is for one buyer, and every style that has them in its BOM has orders only from that buyer. Giving them that buyer keeps them off other buyers' orders. Colours shared by several buyers' styles stay common.</p>
                        <div className="max-h-80 overflow-y-auto border border-slate-200 rounded-lg">
                            <table className="w-full text-sm">
                                <thead className="bg-slate-50 text-left text-xs font-bold text-slate-500"><tr><th className="px-3 py-1.5">Colour</th><th className="px-3 py-1.5">Buyer</th><th className="px-3 py-1.5 w-10" /></tr></thead>
                                <tbody>
                                    {applying.map(r => (
                                        <tr key={r.id} className="border-t border-slate-100">
                                            <td className="px-3 py-1.5 font-semibold text-slate-800">{r.label}</td>
                                            <td className="px-3 py-1.5 text-slate-700">{r.suggested_customer_name}</td>
                                            <td className="px-3 py-1.5 text-right"><button type="button" className="text-xs font-semibold text-slate-500 hover:text-rose-600" onClick={() => setApplying(applying.filter(x => x.id !== r.id))} aria-label={`Leave ${r.label} common`}>skip</button></td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot><tr className="border-t-2 border-slate-200 bg-slate-50 text-xs font-bold text-slate-600"><td className="px-3 py-1.5" colSpan={3}>{applying.length} colour{applying.length === 1 ? '' : 's'}</td></tr></tfoot>
                            </table>
                        </div>
                        <ErrorBox text={formError} />
                        <div className="flex justify-end gap-2">
                            <SecondaryButton onClick={() => setApplying(null)}>Cancel</SecondaryButton>
                            <PrimaryButton onClick={applyAll} busy={saving} disabled={saving || !applying.length}>Give {applying.length} colour{applying.length === 1 ? '' : 's'} their buyer</PrimaryButton>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
}

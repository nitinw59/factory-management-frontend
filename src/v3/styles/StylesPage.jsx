// Styles (v3.styles): list + create. A style's sizes, parts and route are
// edited on its own page.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, ChevronRight } from 'lucide-react';
import Modal from '../../shared/Modal';
import { stylesApi } from '../api/stylesApi';
import { apiError } from '../api/mastersApi';
import { PageHeader, SearchInput, Field, inputCls, PrimaryButton, SecondaryButton, ErrorBox, ActiveBadge, Loading } from '../components/ui';

export default function StylesPage() {
    const navigate = useNavigate();
    const [rows, setRows] = useState(null);
    const [canEdit, setCanEdit] = useState(false);
    const [search, setSearch] = useState('');
    const [error, setError] = useState('');
    const [creating, setCreating] = useState(null);
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState('');

    const load = useCallback(() => {
        stylesApi.styles().then(res => setRows(res.data)).catch(err => setError(apiError(err, 'Failed to load styles.')));
    }, []);
    useEffect(() => {
        load();
        stylesApi.permissions().then(res => setCanEdit(res.data.styles)).catch(() => {});
    }, [load]);

    const shown = useMemo(() => {
        const q = search.trim().toLowerCase();
        return (rows || []).filter(r => !q || `${r.style_code} ${r.name} ${r.buyer || ''} ${r.product_type || ''}`.toLowerCase().includes(q));
    }, [rows, search]);

    const create = async () => {
        setSaving(true); setFormError('');
        try {
            const res = await stylesApi.createStyle(creating);
            navigate(`/v3/styles/${res.data.id}`);
        } catch (err) {
            setFormError(apiError(err, 'Failed to create the style.'));
            setSaving(false);
        }
    };

    const setupGaps = (r) => [r.size_count === 0 && 'sizes', r.part_count === 0 && 'parts', r.stage_count === 0 && 'route'].filter(Boolean);

    return (
        <div>
            <PageHeader
                title="Styles"
                subtitle="Each style has its size range, pattern parts and production route. BOMs are made per style."
                actions={<>
                    <SearchInput value={search} onChange={setSearch} placeholder="Search code, name, buyer" />
                    {canEdit && <PrimaryButton onClick={() => { setFormError(''); setCreating({ style_code: '', name: '', buyer: '', product_type: '' }); }}><Plus size={15} /> New style</PrimaryButton>}
                </>}
            />
            <ErrorBox text={error} />
            {!rows ? <Loading /> : (
                <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
                    <table className="w-full text-sm min-w-[760px]">
                        <thead className="bg-slate-50 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                            <tr><th className="px-4 py-2.5">Style</th><th className="px-4 py-2.5">Buyer</th><th className="px-4 py-2.5">Type</th><th className="px-4 py-2.5">Set up</th><th className="px-4 py-2.5">Status</th><th className="px-4 py-2.5 w-10" /></tr>
                        </thead>
                        <tbody>
                            {shown.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">No styles yet.</td></tr>}
                            {shown.map(r => {
                                const gaps = setupGaps(r);
                                return (
                                    <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50">
                                        <td className="px-4 py-2.5">
                                            <Link to={`/v3/styles/${r.id}`} className="font-semibold text-indigo-700 hover:underline">{r.style_code}</Link>
                                            <span className="block text-xs text-slate-500">{r.name}</span>
                                        </td>
                                        <td className="px-4 py-2.5 text-slate-600">{r.buyer || '—'}</td>
                                        <td className="px-4 py-2.5 text-slate-600">{r.product_type || '—'}</td>
                                        <td className="px-4 py-2.5 text-xs">
                                            <span className="text-slate-600">{r.size_count} sizes · {r.part_count} parts · {r.stage_count} stages</span>
                                            {gaps.length > 0 && <span className="block font-bold text-amber-700">missing: {gaps.join(', ')}</span>}
                                        </td>
                                        <td className="px-4 py-2.5"><ActiveBadge active={r.is_active} /></td>
                                        <td className="px-4 py-2.5 text-right"><Link to={`/v3/styles/${r.id}`} className="text-slate-400 hover:text-indigo-600" aria-label={`Open ${r.style_code}`}><ChevronRight size={16} /></Link></td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {creating && (
                <Modal title="New style" onClose={() => setCreating(null)}>
                    <div className="space-y-4 w-[min(520px,85vw)]">
                        <div className="grid grid-cols-2 gap-3">
                            <Field label="Style code *" hint="Unique, e.g. TBC-101."><input className={inputCls} value={creating.style_code} onChange={e => setCreating({ ...creating, style_code: e.target.value })} autoFocus /></Field>
                            <Field label="Style name *"><input className={inputCls} value={creating.name} onChange={e => setCreating({ ...creating, name: e.target.value })} /></Field>
                            <Field label="Buyer"><input className={inputCls} value={creating.buyer} onChange={e => setCreating({ ...creating, buyer: e.target.value })} /></Field>
                            <Field label="Product type" hint="e.g. Jeans, Chinos."><input className={inputCls} value={creating.product_type} onChange={e => setCreating({ ...creating, product_type: e.target.value })} /></Field>
                        </div>
                        <p className="text-xs text-slate-500">Sizes, parts and route are set on the next page.</p>
                        <ErrorBox text={formError} />
                        <div className="flex justify-end gap-2">
                            <SecondaryButton onClick={() => setCreating(null)}>Cancel</SecondaryButton>
                            <PrimaryButton onClick={create} busy={saving} disabled={saving || !creating.style_code.trim() || !creating.name.trim()}>Create style</PrimaryButton>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
}

// BOMs tab on the style page: every version, newest first, and starting a new
// one (blank, or a copy of an existing version).
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Copy } from 'lucide-react';
import { stylesApi } from '../api/stylesApi';
import { apiError } from '../api/mastersApi';
import { PrimaryButton, ErrorBox, Loading } from '../components/ui';
import BomStatusBadge from './BomStatusBadge';

export default function StyleBomsTab({ styleId, canEdit }) {
    const navigate = useNavigate();
    const [boms, setBoms] = useState(null);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    const load = useCallback(() => {
        stylesApi.styleBoms(styleId).then(res => setBoms(res.data)).catch(err => setError(apiError(err, 'Failed to load BOMs.')));
    }, [styleId]);
    useEffect(() => { load(); }, [load]);

    const create = async (copyFrom) => {
        setBusy(true); setError('');
        try {
            const res = await stylesApi.createBom(styleId, copyFrom);
            navigate(`/v3/boms/${res.data.id}`);
        } catch (err) {
            setError(apiError(err, 'Failed to create the BOM.'));
            setBusy(false);
        }
    };

    if (!boms) return error ? <ErrorBox text={error} /> : <Loading />;
    const approved = boms.find(b => b.status === 'APPROVED');
    const latest = boms[0];
    const openDraft = boms.find(b => ['DRAFT', 'REJECTED', 'PENDING_APPROVAL'].includes(b.status));

    return (
        <div>
            <div className="flex flex-wrap items-center gap-2 mb-3">
                <p className="text-sm text-slate-500 flex-1 min-w-[240px]">
                    One approved version at a time. An approved BOM can't be edited; make a new version (a copy) and approve that.
                </p>
                {canEdit && boms.length === 0 && <PrimaryButton onClick={() => create(null)} busy={busy} disabled={busy}><Plus size={15} /> New BOM</PrimaryButton>}
                {canEdit && boms.length > 0 && (
                    <PrimaryButton onClick={() => create((approved || latest).id)} busy={busy} disabled={busy}>
                        <Copy size={15} /> New version (copy of v{(approved || latest).version_no})
                    </PrimaryButton>
                )}
            </div>
            {openDraft && canEdit && <p className="text-xs font-bold text-amber-700 mb-2">Version {openDraft.version_no} is still {openDraft.status.replace('_', ' ').toLowerCase()}; you may want to continue that one.</p>}
            <ErrorBox text={error} />
            {boms.length === 0 ? (
                <p className="text-sm text-slate-400 py-6">No BOM yet for this style.</p>
            ) : (
                <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg">
                    {boms.map(b => (
                        <Link key={b.id} to={`/v3/boms/${b.id}`} className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-slate-50">
                            <span className="font-black text-slate-800 w-12">v{b.version_no}</span>
                            <BomStatusBadge status={b.status} />
                            <span className="text-xs text-slate-500">{b.colour_count} colour{b.colour_count !== 1 ? 's' : ''}</span>
                            {b.status === 'APPROVED' && b.approved_at && <span className="text-xs text-slate-500">approved {new Date(b.approved_at).toLocaleDateString()}{b.approved_by_name ? ` by ${b.approved_by_name}` : ''}</span>}
                            {b.status === 'REJECTED' && b.rejected_reason && <span className="text-xs font-semibold text-rose-600">“{b.rejected_reason}”</span>}
                            <span className="ml-auto text-sm font-semibold text-indigo-600">Open →</span>
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
}

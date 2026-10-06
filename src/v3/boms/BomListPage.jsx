// All BOMs of all styles, by status — the merchandiser's way back to their drafts
// (and rejected BOMs to fix). Drafts first; open one to edit, submit or approve
// (what you can do there depends on your role).
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { stylesApi } from '../api/stylesApi';
import { apiError } from '../api/mastersApi';
import { PageHeader, ErrorBox, Loading, SearchInput } from '../components/ui';
import BomStatusBadge, { BOM_STATUS } from './BomStatusBadge';

const TABS = ['DRAFT', 'REJECTED', 'PENDING_APPROVAL', 'APPROVED', 'ARCHIVED'];

export default function BomListPage() {
    const [status, setStatus] = useState('DRAFT');
    const [rows, setRows] = useState(null);
    const [q, setQ] = useState('');
    const [error, setError] = useState('');
    useEffect(() => {
        setRows(null);
        stylesApi.boms({ status }).then(res => setRows(res.data)).catch(err => setError(apiError(err, 'Failed to load BOMs.')));
    }, [status]);
    const list = (rows || []).filter(b => !q || `${b.style_code} ${b.style_name}`.toLowerCase().includes(q.toLowerCase()));

    return (
        <div>
            <PageHeader title="BOMs" subtitle="Every BOM of every style. Drafts and rejected BOMs are waiting for the merchandiser; pending ones for approval." />
            <div className="flex flex-wrap gap-2 items-center mb-3">
                {TABS.map(s => (
                    <button key={s} type="button" onClick={() => setStatus(s)}
                        className={`px-3 py-1 rounded-lg text-xs font-bold border ${status === s ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white border-slate-200 text-slate-600'}`}>{BOM_STATUS[s].label}</button>
                ))}
                <div className="ml-auto"><SearchInput value={q} onChange={setQ} placeholder="Search style…" /></div>
            </div>
            <ErrorBox text={error} />
            {!rows ? (!error && <Loading />) : list.length === 0 ? (
                <p className="text-sm text-slate-400 py-6">No {BOM_STATUS[status].label.toLowerCase()} BOMs.</p>
            ) : (
                <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
                    {list.map(b => (
                        <Link key={b.id} to={`/v3/boms/${b.id}`} className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-slate-50">
                            <span className="font-black text-slate-800">{b.style_code} · v{b.version_no}</span>
                            <span className="text-sm text-slate-500">{b.style_name}</span>
                            <BomStatusBadge status={b.status} />
                            <span className="text-xs text-slate-500">{b.colour_count} colour{b.colour_count !== 1 ? 's' : ''}</span>
                            <span className="ml-auto text-xs text-slate-500">{b.submitted_at ? `submitted ${new Date(b.submitted_at).toLocaleString()}${b.submitted_by_name ? ` by ${b.submitted_by_name}` : ''}` : `created ${new Date(b.created_at).toLocaleString()}`}</span>
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
}

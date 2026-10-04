// BOMs waiting for approval (any style), newest first.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { stylesApi } from '../api/stylesApi';
import { apiError } from '../api/mastersApi';
import { PageHeader, ErrorBox, Loading } from '../components/ui';
import BomStatusBadge from './BomStatusBadge';

export default function BomApprovalsPage() {
    const [rows, setRows] = useState(null);
    const [error, setError] = useState('');
    useEffect(() => {
        stylesApi.boms({ status: 'PENDING_APPROVAL' }).then(res => setRows(res.data)).catch(err => setError(apiError(err, 'Failed to load.')));
    }, []);

    return (
        <div>
            <PageHeader title="BOM approvals" subtitle="BOMs submitted and waiting for a decision. Open one to approve or reject it." />
            <ErrorBox text={error} />
            {!rows ? (!error && <Loading />) : rows.length === 0 ? (
                <p className="text-sm text-slate-400 py-6">Nothing waiting for approval.</p>
            ) : (
                <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
                    {rows.map(b => (
                        <Link key={b.id} to={`/v3/boms/${b.id}`} className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-slate-50">
                            <span className="font-black text-slate-800">{b.style_code} · v{b.version_no}</span>
                            <span className="text-sm text-slate-500">{b.style_name}</span>
                            <BomStatusBadge status={b.status} />
                            <span className="text-xs text-slate-500">{b.colour_count} colour{b.colour_count !== 1 ? 's' : ''}</span>
                            <span className="ml-auto text-xs text-slate-500">submitted {b.submitted_at ? new Date(b.submitted_at).toLocaleString() : ''}{b.submitted_by_name ? ` by ${b.submitted_by_name}` : ''}</span>
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
}

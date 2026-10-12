// Approvals inbox: everything waiting for this user's approval in one list — BOMs, sales orders,
// purchase requisitions, goods receipts over tolerance (only the kinds their roles approve).
// Each row opens the page where it is approved; the old per-area approval pages still work.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Inbox } from 'lucide-react';
import { PageHeader, ErrorBox, Loading } from '../components/ui';
import { workApi } from '../api/workApi';
import { apiError } from '../api/mastersApi';

const KIND_CLS = { BOM: 'bg-violet-100 text-violet-800', ORDER: 'bg-sky-100 text-sky-800', REQUISITION: 'bg-amber-100 text-amber-800', GRN: 'bg-emerald-100 text-emerald-800' };

function waited(since) {
    if (!since) return '';
    const h = Math.floor((Date.now() - new Date(since).getTime()) / 3600000);
    if (h < 1) return 'just now';
    if (h < 24) return `${h} h`;
    const d = Math.floor(h / 24);
    return `${d} day${d === 1 ? '' : 's'}`;
}

export default function ApprovalsPage() {
    const navigate = useNavigate();
    const [data, setData] = useState(null);
    const [type, setType] = useState('');
    const [error, setError] = useState('');
    useEffect(() => { workApi.approvals().then(res => setData(res.data)).catch(err => setError(apiError(err, 'Failed to load approvals.'))); }, []);
    if (!data) return error ? <ErrorBox text={error} /> : <Loading />;
    const items = data.items.filter(i => !type || i.type === type);
    const count = (t) => data.items.filter(i => i.type === t).length;

    return (
        <div>
            <PageHeader title="Approvals" subtitle="Everything waiting for your approval, oldest first. Open one to approve or reject it." />
            {data.kinds.length === 0 ? <p className="text-sm text-slate-500">Your role doesn't approve anything in 3.0.</p> : <>
                <div className="flex flex-wrap gap-1.5 mb-3">
                    <button type="button" onClick={() => setType('')} className={`px-3 py-1 rounded-lg text-xs font-bold border ${!type ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white border-slate-200 text-slate-600'}`}>All ({data.items.length})</button>
                    {data.kinds.map(k => (
                        <button key={k.type} type="button" onClick={() => setType(k.type)}
                            className={`px-3 py-1 rounded-lg text-xs font-bold border ${type === k.type ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white border-slate-200 text-slate-600'}`}>{k.label}s ({count(k.type)})</button>
                    ))}
                </div>
                {items.length === 0 ? (
                    <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-500"><Inbox className="mx-auto mb-2 text-slate-300" size={32} />Nothing waiting for you.</div>
                ) : (
                    <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
                        {items.map(i => (
                            <button key={`${i.type}${i.id}`} type="button" onClick={() => navigate(i.to)} className="w-full text-left flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 hover:bg-slate-50">
                                <span className={`text-[10px] font-black uppercase tracking-wide px-2 py-0.5 rounded ${KIND_CLS[i.type] || 'bg-slate-100 text-slate-700'}`}>{i.kind_label}</span>
                                <span className="font-black text-slate-800">{i.number}</span>
                                <span className="text-sm text-slate-600">{i.title}</span>
                                {i.detail && <span className="text-xs text-slate-500 basis-full sm:basis-auto">{i.detail}</span>}
                                <span className="ml-auto text-xs text-slate-500 whitespace-nowrap">{i.by_name ? `${i.by_name} · ` : ''}waiting {waited(i.waiting_since)}</span>
                            </button>
                        ))}
                    </div>
                )}
            </>}
        </div>
    );
}

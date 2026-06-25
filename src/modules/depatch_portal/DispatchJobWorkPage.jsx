import React, { useState, useEffect, useCallback } from 'react';
import { lineLoaderApi } from '../../api/lineLoaderApi';
import { jobWorkApi } from '../../api/jobWorkApi';
import {
    Loader, Package, AlertCircle, Send, FileText,
    ChevronDown, ChevronUp, RefreshCw, CheckCircle2, Truck,
} from 'lucide-react';

const CHALLAN_STATUS = {
    DRAFT:    { label: 'Draft',    cls: 'bg-slate-100 text-slate-600' },
    SENT:     { label: 'Sent',     cls: 'bg-blue-100 text-blue-700' },
    RECEIVED: { label: 'Received', cls: 'bg-emerald-100 text-emerald-700' },
};

// ── ChallanRow ─────────────────────────────────────────────────────────────────

const ChallanRow = ({ challan, onSend, isSending }) => {
    const cfg = CHALLAN_STATUS[challan.status] ?? CHALLAN_STATUS.DRAFT;
    return (
        <div className="flex items-center justify-between px-4 py-3 bg-white rounded-xl border border-slate-200">
            <div className="flex items-center gap-3">
                <FileText size={15} className="text-slate-400 shrink-0" />
                <div>
                    <div className="text-sm font-black text-slate-800">Challan #{challan.id}</div>
                    <div className="text-xs text-slate-400 mt-0.5">
                        {challan.vendor_name ?? 'Vendor'} · {challan.total_items ?? 0} garments
                        {challan.notes && <span className="ml-2 italic">"{challan.notes}"</span>}
                    </div>
                </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
                <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-widest ${cfg.cls}`}>
                    {cfg.label}
                </span>
                {challan.status === 'DRAFT' && (
                    <button
                        onClick={() => onSend(challan.id)}
                        disabled={isSending}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-black uppercase tracking-widest rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
                    >
                        {isSending
                            ? <Loader size={11} className="animate-spin" />
                            : <Send size={11} />}
                        Send
                    </button>
                )}
                {challan.status === 'SENT' && (
                    <span className="flex items-center gap-1 text-[10px] font-bold text-blue-500">
                        <Truck size={11} /> In Transit
                    </span>
                )}
                {challan.status === 'RECEIVED' && (
                    <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-500">
                        <CheckCircle2 size={11} /> Received
                    </span>
                )}
            </div>
        </div>
    );
};

// ── BatchChallanGroup ──────────────────────────────────────────────────────────

const BatchChallanGroup = ({ batch, challans, onSend, sendingChallanId }) => {
    const [expanded, setExpanded] = useState(true);
    const draftCount = challans.filter(c => c.status === 'DRAFT').length;

    return (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <button
                onClick={() => setExpanded(e => !e)}
                className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-slate-50 transition text-left"
            >
                <div className="flex items-center gap-3">
                    <Package size={15} className="text-slate-400 shrink-0" />
                    <div>
                        <span className="text-sm font-black text-slate-800">
                            #{batch.batch_id} · <span className="font-mono">{batch.batch_code}</span>
                        </span>
                        <span className="text-xs text-slate-400 block mt-0.5">{batch.product_name}</span>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    {draftCount > 0 && (
                        <span className="text-[10px] font-black px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 uppercase tracking-widest">
                            {draftCount} draft{draftCount > 1 ? 's' : ''}
                        </span>
                    )}
                    <span className="text-xs font-bold text-slate-400">{challans.length} challan{challans.length !== 1 ? 's' : ''}</span>
                    {expanded ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
                </div>
            </button>

            {expanded && (
                <div className="border-t border-slate-100 px-5 py-4 space-y-2.5">
                    {challans.map(c => (
                        <ChallanRow
                            key={c.id}
                            challan={c}
                            onSend={onSend}
                            isSending={sendingChallanId === c.id}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

// ── DispatchJobWorkPage ────────────────────────────────────────────────────────

const DispatchJobWorkPage = () => {
    const [batches, setBatches] = useState([]);
    const [challansMap, setChallansMap] = useState({});
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    const [sendingChallanId, setSendingChallanId] = useState(null);

    const loadData = useCallback(async () => {
        setIsLoading(true);
        setError('');
        try {
            const res = await lineLoaderApi.getDashboardData();
            const data = res.data || [];
            setBatches(data);

            const results = await Promise.all(
                data.map(b =>
                    jobWorkApi.getBatchChallans(b.batch_id)
                        .then(r => ({ batchId: b.batch_id, challans: r.data || [] }))
                        .catch(() => ({ batchId: b.batch_id, challans: [] }))
                )
            );
            const map = {};
            results.forEach(({ batchId, challans }) => { map[batchId] = challans; });
            setChallansMap(map);
        } catch {
            setError('Failed to load job work data.');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => { loadData(); }, [loadData]);

    const handleSend = async (challanId) => {
        setSendingChallanId(challanId);
        try {
            await jobWorkApi.sendChallan(challanId);
            // refresh all challans to reflect status change
            const batchId = batches.find(b =>
                (challansMap[b.batch_id] || []).some(c => c.id === challanId)
            )?.batch_id;
            if (batchId) {
                const res = await jobWorkApi.getBatchChallans(batchId);
                setChallansMap(prev => ({ ...prev, [batchId]: res.data || [] }));
            }
        } catch {
            alert('Failed to send challan. Please try again.');
        } finally {
            setSendingChallanId(null);
        }
    };

    // Only show batches that have at least one challan
    const batchesWithChallans = batches.filter(b => (challansMap[b.batch_id] || []).length > 0);
    const totalDraft = batchesWithChallans.reduce(
        (sum, b) => sum + (challansMap[b.batch_id] || []).filter(c => c.status === 'DRAFT').length,
        0
    );

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-xl font-black text-slate-800 tracking-tight">Job Work Challans</h1>
                    <p className="text-sm text-slate-400 mt-0.5">Send DRAFT challans to external vendors.</p>
                </div>
                <div className="flex items-center gap-3">
                    {totalDraft > 0 && (
                        <span className="text-sm font-black px-3 py-1.5 rounded-xl bg-amber-100 text-amber-700 border border-amber-200">
                            {totalDraft} pending dispatch
                        </span>
                    )}
                    <button
                        onClick={loadData}
                        disabled={isLoading}
                        className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition disabled:opacity-50 bg-white"
                    >
                        <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} /> Refresh
                    </button>
                </div>
            </div>

            {/* States */}
            {isLoading && (
                <div className="flex items-center justify-center py-16 text-slate-400">
                    <Loader size={20} className="animate-spin mr-2" /> Loading challans…
                </div>
            )}

            {!isLoading && error && (
                <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                    <AlertCircle size={15} /> {error}
                </div>
            )}

            {!isLoading && !error && batchesWithChallans.length === 0 && (
                <div className="text-center py-16 text-slate-400 bg-white rounded-2xl border-2 border-dashed border-slate-200">
                    <FileText size={32} className="mx-auto mb-2 opacity-40" />
                    <p className="text-sm font-bold">No challans found.</p>
                    <p className="text-xs mt-1">Challans created by the production manager will appear here.</p>
                </div>
            )}

            {!isLoading && !error && batchesWithChallans.map(batch => (
                <BatchChallanGroup
                    key={batch.batch_id}
                    batch={batch}
                    challans={challansMap[batch.batch_id] || []}
                    onSend={handleSend}
                    sendingChallanId={sendingChallanId}
                />
            ))}
        </div>
    );
};

export default DispatchJobWorkPage;

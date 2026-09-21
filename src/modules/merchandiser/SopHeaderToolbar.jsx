// ─── SOP HEADER TOOLBAR ─────────────────────────────────────────────────────
// Export action for one scoped requirements grid — Fabric PDF when scope is
// 'fabric', Trim PDFs (one per bucket — see trimRequirementsPdfGenerator.js)
// when scope is 'trim'. BOM link/unlink and calculate/recalculate
// requirements now live in their own dedicated overlays (BomStageModal,
// RequirementsStageModal) since each trail node opens its own focused view
// instead of sharing this toolbar.

import { useState } from 'react';
import { ChevronDown, FileText, Loader2 } from 'lucide-react';
import { adminApi } from '../../api/adminApi';
import { generateFabricRequirementsPdf } from './fabricRequirementsPdfGenerator';
import { getTrimPdfBuckets, generateTrimRequirementsPdf, generateAllTrimRequirementsPdfs } from './trimRequirementsPdfGenerator';

const downloadBlob = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const SopHeaderToolbar = ({ sop, sopReqs, salesOrder, scope }) => {
    const [downloading,  setDownloading]  = useState(false);
    const [err,          setErr]          = useState(null);
    const [info,         setInfo]         = useState(null);
    const [showTrimMenu, setShowTrimMenu] = useState(false);

    const fabricRequirements = sopReqs?.fabric_requirements || [];
    const trimRequirements   = sopReqs?.trim_requirements   || [];

    const handleExportPdf = async () => {
        setDownloading(true);
        setErr(null);
        try {
            let company = null;
            try {
                const cr = await adminApi.getCompanyProfile();
                company = cr.data ?? null;
            } catch { company = null; }
            const blob = await generateFabricRequirementsPdf({ sop, salesOrder, fabricRequirements, company });
            downloadBlob(blob, `fabric-requirements-${(sop.product_name || 'product').replace(/\s+/g, '-')}.pdf`);
        } catch (e) {
            setErr(e?.response?.data?.error || e?.response?.data?.message || 'Failed to generate fabric PDF.');
        } finally {
            setDownloading(false);
        }
    };

    // Both jsPDF calls below are synchronous (doc.save()) — no loading state needed.
    const trimBuckets = scope === 'trim' ? getTrimPdfBuckets({ sop, salesOrder, trimRequirements }) : [];
    const trimBucketsAvailable = trimBuckets.filter(b => b.count > 0).length;

    const handlePickTrimBucket = (bucketKey) => {
        setShowTrimMenu(false);
        setErr(null);
        setInfo(null);
        const ok = generateTrimRequirementsPdf({ sop, salesOrder, trimRequirements, bucketKey });
        if (!ok) setErr('That report has no trim requirements to export.');
    };

    const handleDownloadAllTrimPdfs = () => {
        setShowTrimMenu(false);
        setErr(null);
        setInfo(null);
        const { downloaded, skipped } = generateAllTrimRequirementsPdfs({ sop, salesOrder, trimRequirements });
        if (downloaded.length === 0) {
            setErr('Nothing to export — no trim requirements in any bucket yet.');
        } else if (skipped.length > 0) {
            setInfo(`Downloaded ${downloaded.length} PDF${downloaded.length > 1 ? 's' : ''} (skipped empty: ${skipped.join(', ')}).`);
        } else {
            setInfo(`Downloaded ${downloaded.length} PDFs.`);
        }
    };

    return (
        <div className="flex flex-wrap items-center gap-1.5">
            {scope === 'fabric' ? (
                <button
                    onClick={handleExportPdf}
                    disabled={fabricRequirements.length === 0 || downloading}
                    title="Export fully-reserved fabric requirements as a PDF"
                    className="flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1.5 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200"
                >
                    {downloading ? <Loader2 size={13} className="animate-spin" /> : <FileText size={13} />}
                    Export Fabric PDF
                </button>
            ) : (
                <div className="relative">
                    <button
                        onClick={() => setShowTrimMenu(v => !v)}
                        disabled={trimRequirements.length === 0}
                        title="Export trim requirements as a PDF — pick a report"
                        className="flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1.5 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200"
                    >
                        <FileText size={13} />
                        Export Trim PDF
                        <ChevronDown size={11} className={`transition-transform ${showTrimMenu ? 'rotate-180' : ''}`} />
                    </button>
                    {showTrimMenu && (
                        <>
                            <div className="fixed inset-0 z-10" onClick={() => setShowTrimMenu(false)} />
                            <div className="absolute left-0 top-full mt-1 z-20 w-64 bg-white border border-slate-200 rounded-xl shadow-lg py-1.5 animate-in fade-in zoom-in-95 duration-100">
                                <button
                                    onClick={handleDownloadAllTrimPdfs}
                                    disabled={trimBucketsAvailable === 0}
                                    className="w-full flex items-center justify-between gap-2 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                >
                                    Download All
                                    <span className="text-[10px] font-normal text-slate-400">{trimBucketsAvailable} report{trimBucketsAvailable !== 1 ? 's' : ''}</span>
                                </button>
                                <div className="h-px bg-slate-100 my-1" />
                                {trimBuckets.map(b => (
                                    <button
                                        key={b.key}
                                        onClick={() => handlePickTrimBucket(b.key)}
                                        disabled={b.count === 0}
                                        title={b.count === 0 ? 'No trim requirements in this bucket' : undefined}
                                        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                    >
                                        {b.label}
                                        <span className="text-[10px] font-bold text-slate-400">{b.count}</span>
                                    </button>
                                ))}
                            </div>
                        </>
                    )}
                </div>
            )}
            {err && <p className="text-[11px] text-red-500">{err}</p>}
            {info && <p className="text-[11px] text-emerald-600">{info}</p>}
        </div>
    );
};

export default SopHeaderToolbar;

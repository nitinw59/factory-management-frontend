// ─── BOM STAGE MODAL ─────────────────────────────────────────────────────────
// Dedicated overlay for the trail's "BOM Linked" node. No BOM yet -> the
// Link & Allocate flow. BOM already linked -> a BOM details preview with
// Download (Excel/PDF), Change, and Unlink actions in its header (previously
// scattered across SopHeaderToolbar and the deleted SopSummaryCard's "Unlink"
// flow). Download is open to any viewer, same as the old toolbar's button —
// only Change/Unlink are gated to merchandiser/factory_admin.

import { useState } from 'react';
import { Download, FileText, Link2, Loader2, X } from 'lucide-react';
import { planningApi } from '../../api/planningApi';
import { bomApi } from '../../api/bomApi';
import { adminApi } from '../../api/adminApi';
import { useAuth } from '../../context/AuthContext';
import BomPreviewModal from './BomPreviewModal';
import LinkAndAllocateModal from './LinkAndAllocateModal';
import { generateBomExcel } from './bomExcelExport';
import { generateBomPdf } from './bomPdfGenerator';

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

const BomStageModal = ({ sop, bomOptions, fabricTypes, onLink, onPreview, onDone, onClose }) => {
    const { user } = useAuth();
    // Matches the backend's checkRole(['merchandiser', 'factory_admin']) on the
    // link-bom/unlink-bom routes — UX only, the route is the real enforcement.
    const canManageBom = user?.role === 'merchandiser' || user?.role === 'factory_admin';

    const [changingBom,   setChangingBom]   = useState(false);
    const [downloadingXl, setDownloadingXl] = useState(false);
    const [downloadingPdf, setDownloadingPdf] = useState(false);
    const [unlinking,     setUnlinking]     = useState(false);
    const [confirmUnlink, setConfirmUnlink] = useState(false);
    const [err,           setErr]           = useState(null);

    const handleDownloadExcel = async () => {
        setDownloadingXl(true);
        setErr(null);
        try {
            const res = await bomApi.getById(sop.bom_id);
            generateBomExcel(res.data?.data ?? res.data);
        } catch (e) {
            setErr(e?.response?.data?.error || e?.response?.data?.message || 'Failed to download BOM.');
        } finally {
            setDownloadingXl(false);
        }
    };

    const handleDownloadPdf = async () => {
        setDownloadingPdf(true);
        setErr(null);
        try {
            const res = await bomApi.getById(sop.bom_id);
            const bom = res.data?.data ?? res.data;
            let company = null;
            try {
                const cr = await adminApi.getCompanyProfile();
                company = cr.data ?? null;
            } catch { company = null; }
            const blob = generateBomPdf({ bom, company });
            const safeName = (bom.bom_name || `${bom.id}`).trim().replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, '-');
            downloadBlob(blob, `BOM-${safeName}.pdf`);
        } catch (e) {
            setErr(e?.response?.data?.error || e?.response?.data?.message || 'Failed to generate BOM PDF.');
        } finally {
            setDownloadingPdf(false);
        }
    };

    const handleUnlink = async () => {
        setUnlinking(true);
        setErr(null);
        try {
            await planningApi.unlinkBom(sop.id);
            setConfirmUnlink(false);
            onDone && onDone();
            onClose();
        } catch (e) {
            setErr(e?.response?.data?.error || e?.response?.data?.message || 'Failed to unlink BOM.');
        } finally {
            setUnlinking(false);
        }
    };

    // No BOM yet, or "Change BOM" was clicked — same Link & Allocate flow either way.
    if (!sop.bom_id || changingBom) {
        return (
            <LinkAndAllocateModal
                sop={sop}
                bomOptions={bomOptions}
                fabricTypes={fabricTypes}
                onClose={onClose}
                onLink={onLink}
                onPreview={onPreview}
                onDone={() => { onDone && onDone(); onClose(); }}
            />
        );
    }

    return (
        <>
        {err && (
            <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[60] bg-red-50 border border-red-200 text-red-600 text-xs font-medium px-4 py-2 rounded-xl shadow-lg">
                {err}
            </div>
        )}
        <BomPreviewModal
            bomId={sop.bom_id}
            onClose={onClose}
            headerActions={
                <>
                    <button onClick={handleDownloadExcel} disabled={downloadingXl} title="Download BOM (Excel)"
                        className="flex items-center gap-1 text-[10px] font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 px-2 py-1.5 rounded-lg transition-colors disabled:opacity-50">
                        {downloadingXl ? <Loader2 size={11} className="animate-spin" /> : <Download size={11} />} Excel
                    </button>
                    <button onClick={handleDownloadPdf} disabled={downloadingPdf} title="Download BOM (PDF)"
                        className="flex items-center gap-1 text-[10px] font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 px-2 py-1.5 rounded-lg transition-colors disabled:opacity-50">
                        {downloadingPdf ? <Loader2 size={11} className="animate-spin" /> : <FileText size={11} />} PDF
                    </button>
                    {canManageBom && (
                        confirmUnlink ? (
                            <span className="flex items-center gap-1.5 text-[11px] mr-1">
                                <span className="font-medium text-slate-600">Remove BOM?</span>
                                <button onClick={handleUnlink} disabled={unlinking}
                                    className="font-bold text-white bg-red-500 hover:bg-red-600 px-2 py-1 rounded-lg transition-colors disabled:opacity-50">
                                    {unlinking ? <Loader2 size={11} className="animate-spin" /> : 'Yes'}
                                </button>
                                <button onClick={() => setConfirmUnlink(false)} disabled={unlinking}
                                    className="font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 px-2 py-1 rounded-lg transition-colors">
                                    No
                                </button>
                            </span>
                        ) : (
                            <>
                                <button onClick={() => setChangingBom(true)} title="Change BOM"
                                    className="flex items-center gap-1 text-[10px] font-bold text-white bg-violet-600 hover:bg-violet-700 px-2 py-1.5 rounded-lg transition-colors">
                                    <Link2 size={11} /> Change
                                </button>
                                <button onClick={() => setConfirmUnlink(true)} title="Unlink BOM"
                                    className="text-slate-400 hover:text-red-600 hover:bg-red-50 p-1.5 rounded-lg transition-colors">
                                    <X size={13} />
                                </button>
                            </>
                        )
                    )}
                </>
            }
        />
        </>
    );
};

export default BomStageModal;

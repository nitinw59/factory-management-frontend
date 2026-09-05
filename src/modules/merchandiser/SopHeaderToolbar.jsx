// ─── SOP HEADER TOOLBAR ─────────────────────────────────────────────────────
// Action row for the SOP workspace: link/change BOM, download the linked BOM
// as Excel, calculate/recalculate requirements, and export the fabric (PDF) /
// trim (Excel) requirement documents.

import { useState } from 'react';
import { Calculator, Download, FileSpreadsheet, FileText, Link2, Loader2 } from 'lucide-react';
import { planningApi } from '../../api/planningApi';
import { bomApi } from '../../api/bomApi';
import { adminApi } from '../../api/adminApi';
import LinkAndAllocateModal from './LinkAndAllocateModal';
import FinalizeQuantitiesModal from './FinalizeQuantitiesModal';
import RecalculateConfirmModal, { logRecalcBrief } from './RecalculateConfirmModal';
import { generateBomExcel } from './bomExcelExport';
import { generateFabricRequirementsPdf } from './fabricRequirementsPdfGenerator';
import { generateTrimRequirementsExcel } from './trimRequirementsExcelExport';

const ToolbarButton = ({ icon: Icon, label, onClick, disabled, busy, title, tone = 'slate' }) => {
    const toneCls = {
        slate:   'text-slate-600 bg-slate-100 hover:bg-slate-200',
        violet:  'text-white bg-violet-600 hover:bg-violet-700',
        indigo:  'text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200',
        amber:   'text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200',
    }[tone];
    return (
        <button
            onClick={onClick}
            disabled={disabled || busy}
            title={title}
            className={`flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1.5 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${toneCls}`}
        >
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Icon size={13} />}
            {label}
        </button>
    );
};

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

const SopHeaderToolbar = ({ sop, sopReqs, bomOptions, fabricTypes, salesOrder, onLinkBom, onPreviewBom, onRefresh }) => {
    const [showLinkModal,     setShowLinkModal]     = useState(false);
    const [downloadingBom,    setDownloadingBom]    = useState(false);
    const [downloadingPdf,    setDownloadingPdf]    = useState(false);
    const [downloadingExcel,  setDownloadingExcel]  = useState(false);
    const [recalcing,         setRecalcing]         = useState(false);
    const [recalcErr,         setRecalcErr]         = useState(null);
    const [preview,           setPreview]           = useState(null);
    const [showRecalcConfirm, setShowRecalcConfirm] = useState(false);
    const [showQuantityPicker, setShowQuantityPicker] = useState(false);
    const [err,               setErr]               = useState(null);

    const fabricRequirements = sopReqs?.fabric_requirements || [];
    const trimRequirements   = sopReqs?.trim_requirements   || [];

    const handleDownloadBomExcel = async () => {
        if (!sop.bom_id) return;
        setDownloadingBom(true);
        setErr(null);
        try {
            const res = await bomApi.getById(sop.bom_id);
            generateBomExcel(res.data?.data ?? res.data);
        } catch (e) {
            setErr(e?.response?.data?.error || e?.response?.data?.message || 'Failed to download BOM.');
        } finally {
            setDownloadingBom(false);
        }
    };

    const handleRecalcClick = async () => {
        setRecalcErr(null);
        setRecalcing(true);
        try {
            const res  = await planningApi.getRecalculationPreview(sop.id);
            const data = res.data?.data ?? res.data;
            logRecalcBrief('PREVIEW', sop, data);
            if (!data?.has_existing_data) {
                setShowQuantityPicker(true);
            } else {
                setPreview(data);
                setShowRecalcConfirm(true);
            }
        } catch (e) {
            const status = e?.response?.status;
            setRecalcErr(
                e?.response?.data?.error
                || (status === 403 ? 'Not permitted for your role.'
                    : status ? `Recalculation preview failed (HTTP ${status})`
                    : 'Recalculation preview failed')
            );
        } finally {
            setRecalcing(false);
        }
    };

    const doRecalculate = () => {
        logRecalcBrief('CONFIRM', sop, preview);
        setShowRecalcConfirm(false);
        setPreview(null);
        setRecalcErr(null);
        setShowQuantityPicker(true);
    };

    const handleExportPdf = async () => {
        setDownloadingPdf(true);
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
            setDownloadingPdf(false);
        }
    };

    const handleExportExcel = async () => {
        setDownloadingExcel(true);
        setErr(null);
        try {
            generateTrimRequirementsExcel({ sop, salesOrder, trimRequirements });
        } catch (e) {
            setErr('Failed to generate trim Excel.');
        } finally {
            setDownloadingExcel(false);
        }
    };

    return (
        <>
            <div className="flex flex-wrap items-center gap-1.5">
                <ToolbarButton
                    icon={Link2}
                    tone="violet"
                    label={sop.bom_id ? 'Change BOM' : 'Link BOM'}
                    onClick={() => setShowLinkModal(true)}
                />
                <ToolbarButton
                    icon={Download}
                    label="Download BOM (Excel)"
                    disabled={!sop.bom_id}
                    busy={downloadingBom}
                    onClick={handleDownloadBomExcel}
                    title={!sop.bom_id ? 'Link a BOM first' : 'Download the linked BOM as an Excel workbook'}
                />
                <ToolbarButton
                    icon={Calculator}
                    tone="slate"
                    label={sopReqs ? 'Recalculate Requirements' : 'Calculate Requirements'}
                    disabled={!sop.bom_id}
                    busy={recalcing}
                    onClick={handleRecalcClick}
                    title={!sop.bom_id ? 'Link a BOM first' : undefined}
                />
                <span className="w-px h-6 bg-slate-200 mx-1" />
                <ToolbarButton
                    icon={FileText}
                    tone="indigo"
                    label="Export Fabric PDF"
                    disabled={fabricRequirements.length === 0}
                    busy={downloadingPdf}
                    onClick={handleExportPdf}
                    title="Export fully-reserved fabric requirements as a PDF"
                />
                <ToolbarButton
                    icon={FileSpreadsheet}
                    tone="amber"
                    label="Export Trim Excel"
                    disabled={trimRequirements.length === 0}
                    busy={downloadingExcel}
                    onClick={handleExportExcel}
                    title="Export trim requirements as Excel — Completed, In Progress, Pending (with stock per candidate variant), and Raised PRs sheets"
                />
            </div>

            {(err || recalcErr) && (
                <p className="text-[11px] text-red-500 mt-1.5">{err || recalcErr}</p>
            )}

            {showLinkModal && (
                <LinkAndAllocateModal
                    sop={sop}
                    bomOptions={bomOptions}
                    fabricTypes={fabricTypes}
                    onClose={() => setShowLinkModal(false)}
                    onLink={onLinkBom}
                    onPreview={onPreviewBom}
                    onDone={() => { setShowLinkModal(false); onRefresh(); }}
                />
            )}

            {showRecalcConfirm && (
                <RecalculateConfirmModal
                    preview={preview}
                    sopName={sop?.product_name}
                    busy={recalcing}
                    err={recalcErr}
                    onClose={() => { if (recalcing) return; setShowRecalcConfirm(false); setPreview(null); }}
                    onConfirm={doRecalculate}
                />
            )}

            {showQuantityPicker && (
                <FinalizeQuantitiesModal
                    sop={sop}
                    onClose={() => setShowQuantityPicker(false)}
                    onDone={() => { setShowQuantityPicker(false); onRefresh(); }}
                />
            )}
        </>
    );
};

export default SopHeaderToolbar;

// ─── FABRIC INWARD CHALLAN PDF ───────────────────────────────────────────────
// Replaces the fabric store's manual paper "Fabric Inward Challan" (one row
// per fabric-type/colour line on the receipt: roll count and total meters,
// with a blank Remarks column for hand-written notes) with a generated PDF pulled
// straight from the inward that was just recorded/approved. Printed and
// hand-signed on receipt/dispatch, same as the paper original — no embedded
// signature/seal images, just ruled sign-off lines.
//
// Colour code convention (per this business's own paper challans): the
// "C#XX" in the COLOURS column is this factory's own fabric_color.id, NOT
// the printed color_number next to it (that's the mill/buyer's own shade
// number, stored separately) — e.g. "BLACK C#09 - 826" is fabric_color.id 9,
// color_number 826.

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { IMAGE_BASE_URL } from '../../utils/api';

const resolveAssetUrl = (url) => {
    if (!url) return null;
    if (url.startsWith('http')) return url;
    const root = IMAGE_BASE_URL.replace(/\/uploads$/, '');
    return `${root}${url}`;
};

const blobToDataUrl = (blob) => new Promise(resolve => {
    const r = new FileReader();
    r.onloadend = () => resolve(r.result);
    r.onerror   = () => resolve(null);
    r.readAsDataURL(blob);
});

const fetchImage = async (url) => {
    try {
        const res = await fetch(url);
        if (!res.ok) return null;
        const blob = await res.blob();
        const mime = (blob.type || '').toLowerCase();
        const dataUrl = await blobToDataUrl(blob);
        if (!dataUrl) return null;
        if (mime.includes('jpeg') || mime.includes('jpg')) return { dataUrl, format: 'JPEG' };
        if (mime.includes('png'))                          return { dataUrl, format: 'PNG'  };
        return null;
    } catch {
        return null;
    }
};

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-GB').replace(/\//g, '/') : '—';

// Matches the paper convention: whole numbers print bare ("50", not "50.0"),
// fractional ones keep only as many decimals as they need ("50.1", "392.2").
const fmtMeter = (n) => {
    const num = Number(n) || 0;
    return num.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
};

// inward: the full inward row as loaded by InwardsPage/InwardDetailModal —
// { grn_number, id, received_date, items: [{ item_type, fabric_type_name,
//   fabric_color_id, fabric_color_name, fabric_color_number, rolls, pending_rolls }] }.
// company: company profile row (legal_name) | null.
export async function generateFabricInwardChallanPdf({ inward, company }) {
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const PAGE_W = doc.internal.pageSize.getWidth();
    const PAGE_H = doc.internal.pageSize.getHeight();
    const MARGIN = 40;
    const COL_R  = PAGE_W - MARGIN;
    const boxW   = PAGE_W - 2 * MARGIN;

    const ink  = [15, 23, 42];    // near-black — this is a plain ruled form, not a branded document
    const line = [15, 23, 42];

    // Only a first-time PENDING_APPROVAL inward has its rolls parked in
    // pending_rolls. A PENDING_UPDATE (edit of an approved inward) keeps its
    // live fabric_rolls untouched — the proposed edit sits in a separate table
    // — so it prints from `rolls` like an approved one (same as the detail modal).
    const isPending = inward.approval_status === 'PENDING_APPROVAL';
    const fabricLines = (inward.items || []).filter(it => (it.item_type || 'trim') === 'fabric');

    let y = MARGIN;

    // ── Letterhead ────────────────────────────────────────────────────────────
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(...ink);
    doc.text((company?.legal_name || 'Your Company Name').toUpperCase(), PAGE_W / 2, y, { align: 'center' });
    y += 22;
    doc.setFontSize(12);
    doc.text('FABRIC INWARD CHALLAN', PAGE_W / 2, y, { align: 'center' });
    y += 16;

    // ── Date / Challan No. bar ───────────────────────────────────────────────
    autoTable(doc, {
        startY: y,
        theme: 'grid',
        body: [[
            `DATE - ${fmtDate(inward.received_date)}`,
            `CHALLAN NO - ${inward.grn_number || `#${inward.id}`}`,
        ]],
        margin: { left: MARGIN, right: MARGIN },
        styles: { font: 'helvetica', fontStyle: 'bold', fontSize: 9, textColor: ink, lineColor: line, lineWidth: 0.75, cellPadding: 5 },
        columnStyles: { 0: { cellWidth: boxW / 2 }, 1: { cellWidth: boxW / 2 } },
    });
    y = doc.lastAutoTable.finalY;

    // ── Roll breakdown table ─────────────────────────────────────────────────
    // One row per fabric-type/colour line (NOT one row per physical roll) —
    // "Roll No" here is this line's sequence number on the challan, matching
    // the paper convention. Remarks is deliberately left blank — the per-roll
    // meter breakdown that used to be auto-filled there was unreliable, so
    // it's filled in by hand on the print.
    let totalMeters = 0, totalRolls = 0;
    const body = fabricLines.map((it, idx) => {
        const rolls = (isPending ? it.pending_rolls : it.rolls) || [];
        const meters = rolls.reduce((s, r) => s + (parseFloat(r.meter) || 0), 0);
        const uoms = [...new Set(rolls.map(r => r.uom || 'meter'))];
        totalMeters += meters;
        totalRolls  += rolls.length;

        const colourParts = [it.fabric_color_name || 'AGNOSTIC'];
        if (it.fabric_color_id != null) colourParts.push(`C#${String(it.fabric_color_id).padStart(2, '0')}`);
        const colourLabel = it.fabric_color_number
            ? `${colourParts.join(' ')} - ${it.fabric_color_number}`
            : colourParts.join(' ');

        return [
            String(idx + 1),
            it.fabric_type_name || 'Fabric',
            colourLabel,
            fmtMeter(meters),
            String(rolls.length),
            uoms.length === 1 ? uoms[0].toUpperCase() : 'MTR',
            '',
        ];
    });
    // Pad to at least the paper template's 15 blank ruled rows so a printed/
    // signed copy looks like the original form, not a bare 2-line table.
    while (body.length < 15) body.push(['', '', '', '', '', '', '']);
    body.push([
        { content: '', styles: {} },
        { content: '', styles: {} },
        { content: 'TOTAL', styles: { fontStyle: 'bold', halign: 'right' } },
        { content: fmtMeter(totalMeters), styles: { fontStyle: 'bold' } },
        { content: String(totalRolls), styles: { fontStyle: 'bold' } },
        { content: 'MTR', styles: { fontStyle: 'bold' } },
        { content: '', styles: {} },
    ]);

    autoTable(doc, {
        startY: y,
        theme: 'grid',
        head: [['Roll No', 'Item Name', 'Colours', 'Mtr/Kgs', 'No Rolls', 'UOM', 'Remarks']],
        body,
        margin: { left: MARGIN, right: MARGIN },
        styles: { font: 'helvetica', fontSize: 8, textColor: ink, lineColor: line, lineWidth: 0.75, cellPadding: 4, valign: 'middle' },
        headStyles: { fillColor: [255, 255, 255], textColor: ink, fontStyle: 'bold', halign: 'center', lineWidth: 0.75 },
        columnStyles: {
            0: { cellWidth: 44,  halign: 'center' },
            1: { cellWidth: 62 },
            2: { cellWidth: 108 },
            3: { cellWidth: 52,  halign: 'right' },
            4: { cellWidth: 46,  halign: 'center' },
            5: { cellWidth: 34,  halign: 'center' },
            6: { cellWidth: 'auto', fontSize: 7.5 },
        },
    });
    y = doc.lastAutoTable.finalY + 40;

    // ── Signatures ───────────────────────────────────────────────────────────
    if (y > PAGE_H - MARGIN - 40) y = PAGE_H - MARGIN - 40;
    const sigW = 160;
    const drawSig = (label, x) => {
        doc.setDrawColor(...ink);
        doc.setLineWidth(0.75);
        doc.line(x, y, x + sigW, y);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(...ink);
        doc.text(label, x, y + 12);
    };
    drawSig('RECEIVED BY', MARGIN);
    drawSig('AUTHORISED BY', COL_R - sigW);

    return doc.output('blob');
}

export const downloadFabricInwardChallanPdf = async ({ inward, company }) => {
    const blob = await generateFabricInwardChallanPdf({ inward, company });
    const safe = (inward.grn_number || `inward-${inward.id}`).replace(/[^A-Za-z0-9._-]/g, '_');
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${safe}-challan.pdf`;
    a.click();
    URL.revokeObjectURL(url);
};

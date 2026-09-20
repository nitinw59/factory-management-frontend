// ─── FABRIC RETURN NOTE PDF ──────────────────────────────────────────────────
// The document handed to a supplier when fabric rolls are sent back to them —
// generated on demand from the return note's own recorded data (no PDF binary
// is stored server-side; this is regenerated identically every time, same as
// fabricInwardChallanPdfGenerator.js's challan). Plain ruled-form style to
// match that same fabric-store transactional document convention, not the
// branded letterhead style of poPdfGenerator.js.
//
// Unlike the inward challan (one row per fabric-type/colour line), this lists
// one row PER PHYSICAL ROLL — a return note is about specific rolls leaving,
// not an aggregate receipt.

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-GB').replace(/\//g, '/') : '—';

// Matches the challan generator's convention: whole numbers print bare.
const fmtMeter = (n) => {
    const num = Number(n) || 0;
    return num.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
};

// returnNote: the full GET /fabric-store/return-notes/:id response —
// { id, return_note_number, supplier_name, po_code, reason, notes,
//   total_meters, total_rolls, created_at, returned_by_name,
//   items: [{ fabric_roll_id, bale_no, fabric_type_name, fabric_color_name,
//             color_number, meter, uom }] }.
// company: company profile row (legal_name) | null.
export async function generateFabricReturnNotePdf({ returnNote, company }) {
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const PAGE_W = doc.internal.pageSize.getWidth();
    const PAGE_H = doc.internal.pageSize.getHeight();
    const MARGIN = 40;
    const COL_R  = PAGE_W - MARGIN;
    const boxW   = PAGE_W - 2 * MARGIN;

    const ink  = [15, 23, 42];
    const line = [15, 23, 42];

    let y = MARGIN;

    // ── Letterhead ────────────────────────────────────────────────────────────
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(...ink);
    doc.text((company?.legal_name || 'Your Company Name').toUpperCase(), PAGE_W / 2, y, { align: 'center' });
    y += 22;
    doc.setFontSize(12);
    doc.text('FABRIC RETURN NOTE', PAGE_W / 2, y, { align: 'center' });
    y += 16;

    // ── Date / Return Note No. / Supplier bar ────────────────────────────────
    const barBody = [[
        `DATE - ${fmtDate(returnNote.created_at)}`,
        `RETURN NOTE NO - ${returnNote.return_note_number}`,
        `SUPPLIER - ${returnNote.supplier_name || '—'}`,
    ]];
    autoTable(doc, {
        startY: y,
        theme: 'grid',
        body: barBody,
        margin: { left: MARGIN, right: MARGIN },
        styles: { font: 'helvetica', fontStyle: 'bold', fontSize: 9, textColor: ink, lineColor: line, lineWidth: 0.75, cellPadding: 5 },
        columnStyles: { 0: { cellWidth: boxW / 3 }, 1: { cellWidth: boxW / 3 }, 2: { cellWidth: boxW / 3 } },
    });
    y = doc.lastAutoTable.finalY + 12;

    // ── PO reference + reason/notes (plain text, not ruled) ──────────────────
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...ink);
    if (returnNote.po_code) {
        doc.text(`AGAINST PO - ${returnNote.po_code}`, MARGIN, y);
        y += 14;
    }
    doc.text(`REASON: ${returnNote.reason || '—'}`, MARGIN, y);
    y += 14;
    if (returnNote.notes) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        const noteLines = doc.splitTextToSize(`NOTES: ${returnNote.notes}`, boxW);
        doc.text(noteLines, MARGIN, y);
        y += noteLines.length * 11 + 4;
    }
    y += 6;

    // ── Roll breakdown table — one row per physical roll ─────────────────────
    const items = returnNote.items || [];
    let totalMeters = 0;
    const body = items.map((it, idx) => {
        totalMeters += parseFloat(it.meter) || 0;
        const colourLabel = it.fabric_color_number
            ? `${it.fabric_color_name || 'AGNOSTIC'} - ${it.fabric_color_number}`
            : (it.fabric_color_name || 'AGNOSTIC');
        return [
            String(idx + 1),
            it.bale_no || '—',
            it.fabric_type_name || 'Fabric',
            colourLabel,
            fmtMeter(it.meter),
            (it.uom || 'meter').toUpperCase(),
        ];
    });
    while (body.length < 15) body.push(['', '', '', '', '', '']);
    body.push([
        { content: '', styles: {} },
        { content: '', styles: {} },
        { content: '', styles: {} },
        { content: 'TOTAL', styles: { fontStyle: 'bold', halign: 'right' } },
        { content: fmtMeter(returnNote.total_meters ?? totalMeters), styles: { fontStyle: 'bold' } },
        { content: `${returnNote.total_rolls ?? items.length} ROLLS`, styles: { fontStyle: 'bold' } },
    ]);

    autoTable(doc, {
        startY: y,
        theme: 'grid',
        head: [['Roll No', 'Bale No.', 'Item Name', 'Colour', 'Meters', 'UOM']],
        body,
        margin: { left: MARGIN, right: MARGIN },
        styles: { font: 'helvetica', fontSize: 8, textColor: ink, lineColor: line, lineWidth: 0.75, cellPadding: 4, valign: 'middle' },
        headStyles: { fillColor: [255, 255, 255], textColor: ink, fontStyle: 'bold', halign: 'center', lineWidth: 0.75 },
        columnStyles: {
            0: { cellWidth: 50,  halign: 'center' },
            1: { cellWidth: 70 },
            2: { cellWidth: 100 },
            3: { cellWidth: 130 },
            4: { cellWidth: 60,  halign: 'right' },
            5: { cellWidth: 'auto', halign: 'center' },
        },
    });
    y = doc.lastAutoTable.finalY + 40;

    // ── Signatures ───────────────────────────────────────────────────────────
    if (y > PAGE_H - MARGIN - 40) y = PAGE_H - MARGIN - 40;
    const sigW = 180;
    const drawSig = (label, x) => {
        doc.setDrawColor(...ink);
        doc.setLineWidth(0.75);
        doc.line(x, y, x + sigW, y);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(...ink);
        doc.text(label, x, y + 12);
    };
    drawSig('RETURNED BY', MARGIN);
    drawSig('RECEIVED BY (SUPPLIER)', COL_R - sigW);

    return doc.output('blob');
}

export const downloadFabricReturnNotePdf = async ({ returnNote, company }) => {
    const blob = await generateFabricReturnNotePdf({ returnNote, company });
    const safe = (returnNote.return_note_number || `return-${returnNote.id}`).replace(/[^A-Za-z0-9._-]/g, '_');
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${safe}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
};

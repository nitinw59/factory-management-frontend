// General-items issue slip PDF (A5-ish content on A4 portrait).
// Mirrors the poPdfGenerator idiom: jsPDF + autotable, graceful fallbacks
// when company profile fields are missing.

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { IMAGE_BASE_URL } from '../../utils/api';

// ── Image helpers (same approach as poPdfGenerator) ──────────────────────────

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

const transcodeToPng = (dataUrl) => new Promise(resolve => {
    const im = new Image();
    im.crossOrigin = 'anonymous';
    im.onload = () => {
        try {
            const c = document.createElement('canvas');
            c.width  = im.naturalWidth;
            c.height = im.naturalHeight;
            c.getContext('2d').drawImage(im, 0, 0);
            resolve(c.toDataURL('image/png'));
        } catch {
            resolve(null);
        }
    };
    im.onerror = () => resolve(null);
    im.src = dataUrl;
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
        const png = await transcodeToPng(dataUrl);
        return png ? { dataUrl: png, format: 'PNG' } : null;
    } catch {
        return null;
    }
};

// jsPDF's built-in Helvetica has no ₹ glyph — use "Rs." in the document.
const fmtMoney = (v) => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? `Rs. ${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—';
};
const fmtQty = (v) => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n.toLocaleString('en-IN', { maximumFractionDigits: 3 }) : '—';
};
const fmtDateTime = (d) => d ? new Date(d).toLocaleString('en', { dateStyle: 'medium', timeStyle: 'short' }) : '—';

// ── Generator ────────────────────────────────────────────────────────────────
// issue: { id, issue_number, created_at, issued_to_name, issued_to_department,
//          recover_from_salary, notes, issued_by_name, total_value,
//          lines: [{ item_kind, item_name, item_code, variant_color_name,
//                    variant_color_number, variant_size, qty, uom, unit_cost, line_value }] }
export async function generateIssueSlipPdf({ issue, company }) {
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const PAGE_W = doc.internal.pageSize.getWidth();
    const PAGE_H = doc.internal.pageSize.getHeight();
    const MARGIN = 40;
    const COL_R  = PAGE_W - MARGIN;

    const accent = [30, 41, 59];      // slate-800
    const muted  = [100, 116, 139];   // slate-500
    const line   = [203, 213, 225];   // slate-300
    const amber  = [146, 64, 14];     // amber-800

    const logoImg = company?.logo_url
        ? await fetchImage(resolveAssetUrl(company.logo_url))
        : await fetchImage('/matrix_logo.png');

    let y = MARGIN;

    // ── Header: logo + company left, ISSUE SLIP + meta right ────────────────
    if (logoImg?.dataUrl) {
        try { doc.addImage(logoImg.dataUrl, logoImg.format, MARGIN, y, 52, 52, undefined, 'FAST'); } catch { /* skip logo */ }
    }
    const idX = logoImg?.dataUrl ? MARGIN + 64 : MARGIN;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(...accent);
    doc.text(company?.legal_name || 'Your Company Name', idX, y + 14);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...muted);
    const idLines = [];
    if (company?.address_line1) idLines.push(company.address_line1);
    const cityLine = [company?.city, company?.state, company?.pin_code].filter(Boolean).join(' ');
    if (cityLine) idLines.push(cityLine);
    const contactLine = [company?.phone, company?.email].filter(Boolean).join('  ·  ');
    if (contactLine) idLines.push(contactLine);
    let idTextY = y + 28;
    idLines.forEach(ln => {
        doc.splitTextToSize(ln, COL_R - 170 - idX).forEach(w => {
            doc.text(w, idX, idTextY);
            idTextY += 10;
        });
    });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.setTextColor(...accent);
    doc.text('ISSUE SLIP', COL_R, y + 16, { align: 'right' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    let metaY = y + 32;
    const metaRow = (k, v) => {
        doc.setTextColor(...muted);
        doc.text(`${k}:`, COL_R - 130, metaY);
        doc.setTextColor(...accent);
        doc.setFont('helvetica', 'bold');
        doc.text(String(v ?? '—'), COL_R, metaY, { align: 'right' });
        doc.setFont('helvetica', 'normal');
        metaY += 13;
    };
    metaRow('Slip No.', issue.issue_number || `#${issue.id}`);
    metaRow('Date', fmtDateTime(issue.created_at));
    if (issue.issued_by_name) metaRow('Issued By', issue.issued_by_name);

    y = Math.max(y + 60, metaY, idTextY) + 8;
    doc.setDrawColor(...line);
    doc.setLineWidth(0.5);
    doc.line(MARGIN, y, COL_R, y);
    y += 14;

    // ── Issued-to block ──────────────────────────────────────────────────────
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...muted);
    doc.text('ISSUED TO', MARGIN, y);
    y += 13;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...accent);
    doc.text(issue.issued_to_name || '—', MARGIN, y);

    if (issue.recover_from_salary) {
        const nameW = doc.getTextWidth(issue.issued_to_name || '—');
        const badge = 'RECOVER FROM SALARY';
        doc.setFontSize(7);
        const badgeW = doc.getTextWidth(badge) + 12;
        doc.setFillColor(254, 243, 199);   // amber-100
        doc.setDrawColor(252, 211, 77);    // amber-300
        doc.setLineWidth(0.4);
        doc.roundedRect(MARGIN + nameW + 10, y - 9, badgeW, 12, 2, 2, 'FD');
        doc.setTextColor(...amber);
        doc.text(badge, MARGIN + nameW + 16, y - 0.5);
    }
    y += 13;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...muted);
    if (issue.issued_to_department) {
        doc.text(`Department: ${issue.issued_to_department}`, MARGIN, y);
        y += 12;
    }
    y += 4;

    // ── Lines table ──────────────────────────────────────────────────────────
    const lines = issue.lines || [];
    const body = lines.map((l, i) => {
        const isTrim = l.item_kind === 'trim';
        const variantBits = isTrim
            ? [
                `${l.variant_color_number ? `${l.variant_color_number} - ` : ''}${l.variant_color_name || ''}`.trim(),
                l.variant_size,
              ].filter(Boolean).join(' / ')
            : '';
        const name = `${l.item_name || '—'}${variantBits ? ` — ${variantBits}` : ''}${l.item_code ? `  (${l.item_code})` : ''}`;
        return [
            String(i + 1),
            isTrim ? 'Trim' : 'General',
            name,
            `${fmtQty(l.qty)}${l.uom ? ` ${l.uom}` : ''}`,
            fmtMoney(l.unit_cost),
            fmtMoney(l.line_value ?? (parseFloat(l.qty) * parseFloat(l.unit_cost))),
        ];
    });

    autoTable(doc, {
        startY: y,
        head: [['#', 'Type', 'Item', 'Qty', 'Unit Cost', 'Value']],
        body,
        margin: { left: MARGIN, right: MARGIN },
        styles: { fontSize: 9, cellPadding: 6, textColor: accent, lineColor: line, lineWidth: 0.4 },
        headStyles: { fillColor: accent, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8.5 },
        columnStyles: {
            0: { cellWidth: 24, halign: 'center' },
            1: { cellWidth: 50 },
            2: { cellWidth: 'auto' },
            3: { cellWidth: 76, halign: 'right' },
            4: { cellWidth: 76, halign: 'right' },
            5: { cellWidth: 84, halign: 'right' },
        },
    });
    y = doc.lastAutoTable.finalY + 14;

    // ── Total ────────────────────────────────────────────────────────────────
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...accent);
    doc.text('Total Value', COL_R - 200, y);
    doc.text(fmtMoney(issue.total_value), COL_R, y, { align: 'right' });
    doc.setDrawColor(...accent);
    doc.setLineWidth(1);
    doc.line(COL_R - 200, y - 14, COL_R, y - 14);
    doc.line(COL_R - 200, y + 5, COL_R, y + 5);
    y += 24;

    // ── Notes ────────────────────────────────────────────────────────────────
    if (issue.notes && String(issue.notes).trim()) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(...muted);
        doc.text('NOTES', MARGIN, y);
        y += 11;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(...accent);
        doc.splitTextToSize(String(issue.notes).trim(), PAGE_W - 2 * MARGIN).slice(0, 6).forEach(ln => {
            doc.text(ln, MARGIN, y);
            y += 11;
        });
        y += 6;
    }

    // ── Signature blocks ─────────────────────────────────────────────────────
    const sigY = Math.min(Math.max(y + 30, PAGE_H - 140), PAGE_H - 140);
    const sigW = 170;
    const drawSig = (label, x) => {
        doc.setDrawColor(...accent);
        doc.setLineWidth(0.4);
        doc.line(x, sigY, x + sigW, sigY);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(...muted);
        doc.text(label, x, sigY + 11);
    };
    drawSig('Issued By (Store)', MARGIN);
    drawSig('Received By (Employee)', COL_R - sigW);

    // ── Footer ───────────────────────────────────────────────────────────────
    const footerY = PAGE_H - 22;
    doc.setDrawColor(...line);
    doc.setLineWidth(0.4);
    doc.line(MARGIN, footerY - 10, COL_R, footerY - 10);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...muted);
    doc.text(`Generated ${new Date().toLocaleString('en', { dateStyle: 'medium', timeStyle: 'short' })}`, MARGIN, footerY);
    doc.text('Page 1 of 1', COL_R, footerY, { align: 'right' });

    return doc.output('blob');
}

export const downloadIssueSlipPdf = async ({ issue, company }) => {
    const blob = await generateIssueSlipPdf({ issue, company });
    const safe = (issue.issue_number || `issue-${issue.id}`).replace(/[^A-Za-z0-9._-]/g, '_');
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${safe}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
};

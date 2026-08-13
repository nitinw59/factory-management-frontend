// Purchase Invoice booking record — a one-page A4 PDF summarizing what was
// just recorded (this is an internal record of the booking, not a
// replacement for the supplier's own invoice document — that's the uploaded
// scan on invoice.scan_url). Mirrors poPdfGenerator.js's layout conventions
// so PO and Invoice PDFs read as one consistent document family.

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

const transcodeToPng = (dataUrl) => new Promise(resolve => {
    const im = new Image();
    im.crossOrigin = 'anonymous';
    im.onload = () => {
        try {
            const c = document.createElement('canvas');
            c.width  = im.naturalWidth;
            c.height = im.naturalHeight;
            const ctx = c.getContext('2d');
            ctx.drawImage(im, 0, 0);
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

const loadImage       = async (url)  => url ? fetchImage(resolveAssetUrl(url)) : null;
const loadPublicImage = async (path) => path ? fetchImage(path) : null;

const fmtMoney = (n) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtQty   = (n) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 3 });
const fmtDate  = (d) => d ? new Date(d).toLocaleDateString('en', { dateStyle: 'medium' }) : '—';

const _ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
               'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
               'Seventeen', 'Eighteen', 'Nineteen'];
const _tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
const _intToWords = (n) => {
    if (n === 0) return 'Zero';
    let w = '';
    if (n >= 1_000_000) { w += _intToWords(Math.floor(n / 1_000_000)) + ' Million '; n %= 1_000_000; }
    if (n >= 1_000)     { w += _intToWords(Math.floor(n / 1_000)) + ' Thousand ';     n %= 1_000;     }
    if (n >= 100)       { w += _ones[Math.floor(n / 100)] + ' Hundred ';               n %= 100;       }
    if (n >= 20)        { w += _tens[Math.floor(n / 10)] + (n % 10 ? ' ' + _ones[n % 10] : '') + ' '; }
    else if (n > 0)     { w += _ones[n] + ' '; }
    return w.trim();
};
const amountInWords = (amount) => {
    const rounded = Math.round(Math.abs(amount) * 100);
    const rupees  = Math.floor(rounded / 100);
    const paise   = rounded % 100;
    let w = _intToWords(rupees) + (rupees === 1 ? ' Rupee' : ' Rupees');
    if (paise > 0) w += ' and ' + _intToWords(paise) + (paise === 1 ? ' Paisa' : ' Paise');
    return w + ' Only';
};

const MATCH_LABEL = {
    MATCHED:              'Three-Way Matched',
    MATCHED_WITH_WARNING: 'Matched — Review Warnings',
    MISMATCH_OVERRIDDEN:  'Mismatch — Documented Override',
    UNMATCHED:            'Unmatched',
};

// invoice: { invoice_number, invoice_date, amount, payment_status, notes }
// po: { po_code, supplier_name, supplier_address*, supplier_gstin, supplier_phone, supplier_email } | null
// company: company profile row (logo/signature/seal/legal_name/...) | null
// inwards: [{ grn_number, received_date }] — the ones linked on this invoice
// lines: [{ label, uom, qty (total), rate, value, grn }]
// matchReport: the report returned alongside creation — { match_status, reasons, warnings, totals } | null
export async function generateInvoicePdf({ invoice, po, company, inwards = [], lines = [], matchReport = null }) {
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const PAGE_W = doc.internal.pageSize.getWidth();
    const PAGE_H = doc.internal.pageSize.getHeight();
    const MARGIN = 40;
    const COL_R  = PAGE_W - MARGIN;

    const accent = [30, 41, 59];
    const muted  = [100, 116, 139];
    const line   = [203, 213, 225];
    const warn   = [146, 64, 14];
    const warnBg = [254, 243, 199];

    const [logoImg, signatureImg, sealImg] = await Promise.all([
        company?.logo_url ? loadImage(company.logo_url) : loadPublicImage('/matrix_logo.png'),
        loadImage(company?.signature_url),
        loadImage(company?.seal_url),
    ]);

    let y = MARGIN;

    // ── Header ────────────────────────────────────────────────────────────────
    const headerStartY = y;
    if (logoImg?.dataUrl) {
        try { doc.addImage(logoImg.dataUrl, logoImg.format, MARGIN, y, 64, 64, undefined, 'FAST'); } catch {}
    }
    const idX = logoImg?.dataUrl ? MARGIN + 78 : MARGIN;

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
    if (cityLine) idLines.push(`${cityLine}${company?.country ? `, ${company.country}` : ''}`);
    if (company?.gstin) idLines.push(`GSTIN: ${company.gstin}`);
    let idTextY = y + 28;
    idLines.forEach(ln => { doc.text(ln, idX, idTextY); idTextY += 10; });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.setTextColor(...accent);
    doc.text('PURCHASE INVOICE RECORD', COL_R, y + 18, { align: 'right' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    const metaRows = [
        { k: 'Invoice #',  v: invoice.invoice_number },
        { k: 'Inv. Date',  v: fmtDate(invoice.invoice_date) },
        { k: 'PO',         v: po?.po_code || '—' },
        { k: 'Payment',    v: (invoice.payment_status || '').replace(/_/g, ' ') || '—' },
    ];
    let metaY = y + 32;
    metaRows.forEach(({ k, v }) => {
        doc.setTextColor(...muted);
        doc.text(`${k}:`, COL_R - 150, metaY);
        doc.setTextColor(...accent);
        doc.setFont('helvetica', 'bold');
        doc.text(String(v ?? '—'), COL_R, metaY, { align: 'right' });
        doc.setFont('helvetica', 'normal');
        metaY += 13;
    });

    y = Math.max(headerStartY + 90, metaY, idTextY) + 6;
    doc.setDrawColor(...line);
    doc.setLineWidth(0.5);
    doc.line(MARGIN, y, COL_R, y);
    y += 12;

    // ── Supplier box ─────────────────────────────────────────────────────────
    const boxW = PAGE_W - 2 * MARGIN;
    const supplierEntries = [
        po?.supplier_name && { text: po.supplier_name, bold: true },
        po?.supplier_address_line1 || po?.supplier_address,
        po?.supplier_gstin && `GSTIN: ${po.supplier_gstin}`,
        po?.supplier_phone && `Phone: ${po.supplier_phone}`,
        po?.supplier_email && `Email: ${po.supplier_email}`,
    ].filter(Boolean);

    doc.setFillColor(30, 41, 59);
    doc.rect(MARGIN, y, boxW, 18, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(255, 255, 255);
    doc.text('SUPPLIER', MARGIN + 8, y + 12);

    const bodyH = Math.max(40, 14 + supplierEntries.length * 11 + 8);
    doc.setDrawColor(...line);
    doc.setFillColor(248, 250, 252);
    doc.rect(MARGIN, y + 18, boxW, bodyH, 'FD');
    let sy = y + 18 + 14;
    doc.setTextColor(...accent);
    if (supplierEntries.length === 0) {
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(9);
        doc.setTextColor(...muted);
        doc.text('No supplier on record for this PO.', MARGIN + 8, sy);
        sy += 11;
    } else {
        supplierEntries.forEach(e => {
            const bold = typeof e === 'object';
            const text = bold ? e.text : e;
            doc.setFont('helvetica', bold ? 'bold' : 'normal');
            doc.setFontSize(bold ? 9.5 : 9);
            doc.text(String(text), MARGIN + 8, sy);
            sy += 11;
        });
    }
    y = y + 18 + bodyH + 14;

    // ── Linked GRNs ──────────────────────────────────────────────────────────
    if (inwards.length > 0) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(...muted);
        doc.text('LINKED GOODS RECEIPTS', MARGIN, y);
        y += 4;
        doc.setDrawColor(...line);
        doc.line(MARGIN, y + 3, COL_R, y + 3);
        y += 14;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(...accent);
        const grnLine = inwards.map(iw => `${iw.grn_number || `#${iw.id}`} (${fmtDate(iw.received_date)})`).join('   ·   ');
        doc.splitTextToSize(grnLine, boxW).forEach(ln => { doc.text(ln, MARGIN, y); y += 12; });
        y += 6;
    }

    // ── Line items table ─────────────────────────────────────────────────────
    const tableBody = lines.map(l => [
        l.label || '—',
        l.grn || '',
        `${fmtQty(l.qty)}${l.uom ? ' ' + l.uom : ''}`,
        fmtMoney(l.rate),
        fmtMoney(l.value),
    ]);
    autoTable(doc, {
        startY: y,
        head: [['Item', 'GRN', 'Qty', 'Rate', 'Amount']],
        body: tableBody,
        margin: { left: MARGIN, right: MARGIN },
        styles: { fontSize: 9, cellPadding: 6, textColor: accent, lineColor: line, lineWidth: 0.4 },
        headStyles: { fillColor: accent, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8.5, halign: 'left' },
        columnStyles: {
            0: { cellWidth: 'auto' },
            1: { cellWidth: 90 },
            2: { cellWidth: 80, halign: 'right' },
            3: { cellWidth: 70, halign: 'right' },
            4: { cellWidth: 80, halign: 'right' },
        },
    });
    y = doc.lastAutoTable.finalY + 10;

    // ── Totals ───────────────────────────────────────────────────────────────
    const totalsX = COL_R - 200;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...accent);
    doc.text('Total', totalsX, y);
    doc.text(`Rs. ${fmtMoney(invoice.amount)}`, COL_R, y, { align: 'right' });
    doc.setDrawColor(...accent);
    doc.setLineWidth(1.2);
    doc.line(totalsX, y - 14, COL_R, y - 14);
    doc.line(totalsX, y + 4, COL_R, y + 4);
    y += 22;

    const wordsText = amountInWords(parseFloat(invoice.amount) || 0);
    const wordsBoxW = totalsX - MARGIN - 8;
    const wordsBoxY = y - 18;
    doc.setFillColor(241, 245, 249);
    doc.setDrawColor(...line);
    doc.setLineWidth(0.4);
    doc.rect(MARGIN, wordsBoxY, wordsBoxW, 32, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...muted);
    doc.text('AMOUNT IN WORDS', MARGIN + 8, wordsBoxY + 10);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...accent);
    doc.splitTextToSize(wordsText, wordsBoxW - 16).slice(0, 2).forEach((ln, i) => {
        doc.text(ln, MARGIN + 8, wordsBoxY + 22 + i * 10);
    });
    y = wordsBoxY + 32 + 16;

    // ── Three-way match status ───────────────────────────────────────────────
    if (matchReport) {
        const status = matchReport.match_status;
        const reasons  = matchReport.reasons  || [];
        const warnings = matchReport.warnings || [];
        const notes = [...reasons, ...warnings];
        const boxH = Math.max(28, 16 + notes.length * 11 + 8);
        const isClean = status === 'MATCHED';
        doc.setFillColor(...(isClean ? [236, 253, 245] : warnBg));
        doc.setDrawColor(...(isClean ? [167, 243, 208] : [252, 211, 77]));
        doc.setLineWidth(0.4);
        doc.rect(MARGIN, y, boxW, boxH, 'FD');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(...(isClean ? [4, 120, 87] : warn));
        doc.text(`Three-Way Match: ${MATCH_LABEL[status] || status || '—'}`, MARGIN + 8, y + 12);
        let ny = y + 12 + 13;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        notes.slice(0, 6).forEach(n => {
            doc.splitTextToSize(`• ${n}`, boxW - 16).forEach(ln => { doc.text(ln, MARGIN + 8, ny); ny += 11; });
        });
        y += boxH + 14;
    }

    if (invoice.notes && String(invoice.notes).trim()) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(...muted);
        doc.text('NOTES', MARGIN, y);
        y += 11;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(...accent);
        doc.splitTextToSize(String(invoice.notes).trim(), boxW).forEach(ln => { doc.text(ln, MARGIN, y); y += 11; });
        y += 8;
    }

    // ── Signature block ──────────────────────────────────────────────────────
    const sigBoxW = 200, sigBoxH = 76;
    const sigX = COL_R - sigBoxW;
    const sigY = Math.min(y + 10, PAGE_H - MARGIN - sigBoxH - 30);
    doc.setDrawColor(...line);
    doc.setLineWidth(0.4);
    doc.rect(sigX, sigY, sigBoxW, sigBoxH);
    if (signatureImg?.dataUrl) {
        try { doc.addImage(signatureImg.dataUrl, signatureImg.format, sigX + 8, sigY + 6, 100, 36, undefined, 'FAST'); } catch {}
    }
    if (sealImg?.dataUrl) {
        try { doc.addImage(sealImg.dataUrl, sealImg.format, sigX + sigBoxW - 56, sigY + 6, 48, 48, undefined, 'FAST'); } catch {}
    }
    doc.setDrawColor(...accent);
    doc.line(sigX + 8, sigY + 50, sigX + sigBoxW - 8, sigY + 50);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...accent);
    doc.text(company?.authorized_signatory_name || 'Authorized Signatory', sigX + 8, sigY + 62);

    // ── Footer ───────────────────────────────────────────────────────────────
    const footerY = PAGE_H - 22;
    doc.setDrawColor(...line);
    doc.setLineWidth(0.4);
    doc.line(MARGIN, footerY - 10, COL_R, footerY - 10);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...muted);
    doc.text(`Generated ${new Date().toLocaleString('en', { dateStyle: 'medium', timeStyle: 'short' })}`, MARGIN, footerY);
    doc.text('Internal record — not a substitute for the supplier\'s original invoice.', COL_R, footerY, { align: 'right' });

    return doc.output('blob');
}

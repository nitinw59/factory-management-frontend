// US corporate-grade Purchase Order PDF.
// Single-page layout in A4 portrait; falls back gracefully when company/PO fields are missing.

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { IMAGE_BASE_URL } from '../../utils/api';

// ── Helpers ──────────────────────────────────────────────────────────────────

const resolveAssetUrl = (url) => {
    if (!url) return null;
    if (url.startsWith('http')) return url;
    const root = IMAGE_BASE_URL.replace(/\/uploads$/, '');
    return `${root}${url}`;
};

// Read a blob to a data URL.
const blobToDataUrl = (blob) => new Promise(resolve => {
    const r = new FileReader();
    r.onloadend = () => resolve(r.result);
    r.onerror   = () => resolve(null);
    r.readAsDataURL(blob);
});

// Re-encode an image data URL to PNG using a canvas (handles WebP / AVIF, both of
// which jsPDF's addImage cannot decode natively).
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

// Returns { dataUrl, format } where format is 'PNG' | 'JPEG' (what jsPDF accepts).
const loadImage = async (url) => {
    const abs = resolveAssetUrl(url);
    if (!abs) return null;
    return fetchImage(abs);
};

// Load an image from the frontend's own origin (e.g. `/matrix_logo.png` in /public).
// Skips the backend asset-url resolution.
const loadPublicImage = async (path) => {
    if (!path) return null;
    return fetchImage(path);
};

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
        // WebP / AVIF / unknown — bake to PNG via canvas so jsPDF can embed it.
        const png = await transcodeToPng(dataUrl);
        return png ? { dataUrl: png, format: 'PNG' } : null;
    } catch {
        return null;
    }
};

const fmtMoney = (n) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtQty   = (n) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 3 });
const fmtDate  = (d) => d ? new Date(d).toLocaleDateString('en', { dateStyle: 'medium' }) : '—';

// ── Generator ────────────────────────────────────────────────────────────────

export async function generatePoPdf({ po, company, version = 1, supplierCodes = new Map() }) {
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const PAGE_W = doc.internal.pageSize.getWidth();
    const PAGE_H = doc.internal.pageSize.getHeight();
    const MARGIN = 40;
    const COL_R  = PAGE_W - MARGIN;

    const accent = [30, 41, 59];      // slate-800
    const muted  = [100, 116, 139];   // slate-500
    const line   = [203, 213, 225];   // slate-300

    // Preload images (logo + signature + seal). Logo defaults to the in-repo
    // matrix_logo.png in /public when the company hasn't uploaded a custom one.
    const [logoImg, signatureImg, sealImg] = await Promise.all([
        company?.logo_url
            ? loadImage(company.logo_url)
            : loadPublicImage('/matrix_logo.png'),
        loadImage(company?.signature_url),
        loadImage(company?.seal_url),
    ]);

    let y = MARGIN;

    // ── Header band ──────────────────────────────────────────────────────────
    // Left: logo + company identity. Right: PURCHASE ORDER + PO meta.
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
    if (company?.address_line2) idLines.push(company.address_line2);
    const cityLine = [company?.city, company?.state, company?.pin_code].filter(Boolean).join(' ');
    if (cityLine) idLines.push(`${cityLine}${company?.country ? `, ${company.country}` : ''}`);
    const contactLine = [company?.phone, company?.email].filter(Boolean).join('  ·  ');
    if (contactLine) idLines.push(contactLine);
    if (company?.website) idLines.push(company.website);
    if (company?.gstin) idLines.push(`GSTIN: ${company.gstin}` + (company.pan ? `   ·   PAN: ${company.pan}` : ''));
    else if (company?.pan) idLines.push(`PAN: ${company.pan}`);

    const idMaxWidth = Math.max(120, (COL_R - 140) - idX);
    let idTextY = y + 28;
    idLines.forEach(ln => {
        doc.splitTextToSize(ln, idMaxWidth).forEach(w => {
            doc.text(w, idX, idTextY);
            idTextY += 10;
        });
    });

    // Right block — title + meta
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.setTextColor(...accent);
    doc.text('PURCHASE ORDER', COL_R, y + 18, { align: 'right' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...muted);
    const metaRows = [
        { k: 'PO Number', v: po.po_code || `PO-${po.id}`, highlight: false },
        { k: 'PO Date',   v: fmtDate(po.created_at), highlight: false },
        { k: 'Expected',  v: fmtDate(po.expected_delivery_date), highlight: true },
        { k: 'Status',    v: (po.status || '').replace(/_/g, ' '), highlight: false },
    ];
    let metaY = y + 32;
    metaRows.forEach(({ k, v, highlight }) => {
        if (highlight) {
            // Amber-tinted band behind the row to draw the eye to the expected date.
            const bandX = COL_R - 152;
            const bandW = 152;
            doc.setFillColor(254, 243, 199);   // amber-100
            doc.setDrawColor(252, 211, 77);    // amber-300
            doc.setLineWidth(0.4);
            doc.roundedRect(bandX, metaY - 9, bandW, 14, 2, 2, 'FD');
            doc.setTextColor(146, 64, 14);     // amber-800
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(8.5);
            doc.text(`${k}:`, COL_R - 130, metaY);
            doc.setFontSize(10);
            doc.text(String(v ?? '—'), COL_R - 4, metaY, { align: 'right' });
            doc.setFontSize(9);
            doc.setFont('helvetica', 'normal');
            metaY += 16;
        } else {
            doc.setTextColor(...muted);
            doc.text(`${k}:`, COL_R - 130, metaY);
            doc.setTextColor(...accent);
            doc.setFont('helvetica', 'bold');
            doc.text(String(v ?? '—'), COL_R, metaY, { align: 'right' });
            doc.setFont('helvetica', 'normal');
            metaY += 12;
        }
    });

    y = Math.max(headerStartY + 90, metaY, idTextY) + 6;

    // Header separator
    doc.setDrawColor(...line);
    doc.setLineWidth(0.5);
    doc.line(MARGIN, y, COL_R, y);
    y += 12;

    // ── Vendor + Ship To boxes ───────────────────────────────────────────────
    // Each entry is either a string or { text, bold }. The first line in each
    // block is the name (bold). Boxes auto-size so long addresses aren't clipped.
    const colWidth = (PAGE_W - 2 * MARGIN - 12) / 2;
    const boxStartY = y;
    const TITLE_H = 18;
    const PAD_X   = 8;
    const PAD_TOP = 14;
    const PAD_BOT = 8;
    const LINE_H  = 11;
    const MIN_BODY = 70;

    const wrapEntries = (entries) => {
        const out = [];
        entries.filter(Boolean).forEach(e => {
            const text = typeof e === 'string' ? e : e.text;
            const bold = typeof e === 'object' && !!e.bold;
            if (text == null || text === '') return;
            doc.setFont('helvetica', bold ? 'bold' : 'normal');
            doc.setFontSize(bold ? 9.5 : 9);
            const wrapped = doc.splitTextToSize(String(text), colWidth - 2 * PAD_X);
            wrapped.forEach(line => out.push({ text: line, bold }));
        });
        return out;
    };

    const drawBox = (title, x, entries) => {
        const wrapped = wrapEntries(entries);
        const bodyH   = Math.max(MIN_BODY, PAD_TOP + wrapped.length * LINE_H + PAD_BOT);

        // Title bar
        doc.setFillColor(...accent);
        doc.rect(x, y, colWidth, TITLE_H, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(255, 255, 255);
        doc.text(title.toUpperCase(), x + PAD_X, y + 12);

        // Body
        doc.setDrawColor(...line);
        doc.setFillColor(248, 250, 252);
        doc.rect(x, y + TITLE_H, colWidth, bodyH, 'FD');

        doc.setTextColor(...accent);
        let ly = y + TITLE_H + PAD_TOP;
        wrapped.forEach(w => {
            doc.setFont('helvetica', w.bold ? 'bold' : 'normal');
            doc.setFontSize(w.bold ? 9.5 : 9);
            doc.text(w.text, x + PAD_X, ly);
            ly += LINE_H;
        });
        return TITLE_H + bodyH;
    };

    const supplierCityLine = [po.supplier_city, po.supplier_state, po.supplier_pin].filter(Boolean).join(' ');
    const vendorEntries = [
        po.supplier_name && { text: po.supplier_name, bold: true },
        po.supplier_address_line1 || po.supplier_address,
        po.supplier_address_line2,
        supplierCityLine || null,
        po.supplier_country,
        po.supplier_phone && `Phone: ${po.supplier_phone}`,
        po.supplier_email && `Email: ${po.supplier_email}`,
        po.supplier_gstin && `GSTIN: ${po.supplier_gstin}`,
        po.supplier_pan   && `PAN: ${po.supplier_pan}`,
    ];

    const companyCityLine = [company?.city, company?.state, company?.pin_code, company?.country].filter(Boolean).join(' ');
    const shipToEntries = [
        (company?.legal_name || 'Your Company Name') && { text: company?.legal_name || 'Your Company Name', bold: true },
        company?.address_line1,
        company?.address_line2,
        companyCityLine || null,
        company?.phone && `Phone: ${company.phone}`,
        company?.email && `Email: ${company.email}`,
        company?.gstin && `GSTIN: ${company.gstin}`,
        company?.pan   && `PAN: ${company.pan}`,
    ];

    const shipToX  = MARGIN + colWidth + 12;
    const vendorH  = drawBox('VENDOR',  MARGIN,  vendorEntries);
    const shipToH  = drawBox('SHIP TO', shipToX, shipToEntries);
    y = boxStartY + Math.max(vendorH, shipToH) + 16;

    // ── Notes block (optional) ───────────────────────────────────────────────
    if (po.notes && String(po.notes).trim()) {
        const noteText = String(po.notes).trim();
        const noteWidth = PAGE_W - MARGIN * 2;
        const innerPad = 8;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        const lines = doc.splitTextToSize(noteText, noteWidth - innerPad * 2);
        const labelHeight = 14;
        const lineHeight = 11;
        const boxHeight = labelHeight + lines.length * lineHeight + innerPad;

        doc.setFillColor(252, 247, 230);   // very light amber
        doc.setDrawColor(...line);
        doc.setLineWidth(0.4);
        doc.rect(MARGIN, y, noteWidth, boxHeight, 'FD');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(...muted);
        doc.text('NOTES', MARGIN + innerPad, y + 10);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(...accent);
        let lineY = y + labelHeight + 4;
        lines.forEach(ln => {
            doc.text(ln, MARGIN + innerPad, lineY);
            lineY += lineHeight;
        });

        y += boxHeight + 14;
    }

    // ── Items table ──────────────────────────────────────────────────────────
    const items = po.items || [];

    // Group items by parent: fabric_type for fabric items, trim_item for trim items.
    // The PDF prints one bold "parent" row per group with shared UOM + price + group totals,
    // followed by indented sub-rows for each color / variant.
    const groups = (() => {
        const fabricMap = new Map();
        const trimMap   = new Map();
        items.forEach(it => {
            if (it.item_type === 'fabric') {
                const key = it.fabric_type_id ?? it.fabric_type_name ?? `f-${it.id}`;
                if (!fabricMap.has(key)) {
                    fabricMap.set(key, {
                        type:       'fabric',
                        parentName: it.fabric_type_name || 'Fabric',
                        code:       '',
                        items:      [],
                    });
                }
                fabricMap.get(key).items.push(it);
            } else {
                const key = it.trim_item_id ?? it.trim_item_name ?? `t-${it.id}`;
                if (!trimMap.has(key)) {
                    trimMap.set(key, {
                        type:       'trim',
                        parentName: it.trim_item_name || 'Trim',
                        code:       it.trim_item_code || it.item_code || '',
                        items:      [],
                    });
                }
                trimMap.get(key).items.push(it);
            }
        });
        return [...fabricMap.values(), ...trimMap.values()];
    })();

    const HEADER_FILL = [241, 245, 249];      // slate-100
    const SUB_LABEL_INDENT = '   · ';
    const tableBody = [];
    groups.forEach((g, gi) => {
        const groupQty = g.items.reduce((s, it) => s + parseFloat(it.quantity || 0), 0);
        const groupTotal = g.items.reduce((s, it) => {
            const t = it.total_price != null ? parseFloat(it.total_price) : (parseFloat(it.quantity || 0) * parseFloat(it.unit_price || 0));
            return s + t;
        }, 0);
        const uoms   = new Set(g.items.map(it => it.uom || (it.item_type === 'fabric' ? 'm' : 'pcs')));
        const prices = new Set(g.items.map(it => Number(parseFloat(it.unit_price || 0).toFixed(2))));
        const sharedUom   = uoms.size === 1 ? [...uoms][0] : null;
        const sharedPrice = prices.size === 1 ? [...prices][0] : null;

        const sharedSuffixParts = [];
        if (sharedUom)               sharedSuffixParts.push(`per ${sharedUom}`);
        if (sharedPrice != null)     sharedSuffixParts.push(`@ ${fmtMoney(sharedPrice)}`);
        const headerLabel = sharedSuffixParts.length
            ? `${g.parentName}  ·  ${sharedSuffixParts.join('  ·  ')}`
            : g.parentName;

        const headerCellStyle = { fontStyle: 'bold', fillColor: HEADER_FILL };
        tableBody.push([
            { content: String(gi + 1), styles: { ...headerCellStyle, halign: 'center' } },
            { content: headerLabel,    styles: headerCellStyle },
            { content: g.code || '',   styles: headerCellStyle },
            { content: `${fmtQty(groupQty)}${sharedUom ? ' ' + sharedUom : ''}`, styles: { ...headerCellStyle, halign: 'right' } },
            { content: sharedPrice != null ? fmtMoney(sharedPrice) : '', styles: { ...headerCellStyle, halign: 'right' } },
            { content: fmtMoney(groupTotal), styles: { ...headerCellStyle, halign: 'right' } },
        ]);

        g.items.forEach(it => {
            const subLabel = it.item_type === 'fabric'
                ? `${SUB_LABEL_INDENT}${it.fabric_color_name || 'No color'}${it.fabric_color_number ? ` (${it.fabric_color_number})` : ''}`
                : `${SUB_LABEL_INDENT}${it.variant_color_name || 'No variant'}${it.variant_color_number ? ` (${it.variant_color_number})` : ''}${it.variant_size ? ` · Sz ${it.variant_size}` : ''}`;
            const qty   = parseFloat(it.quantity || 0);
            const price = parseFloat(it.unit_price || 0);
            const total = it.total_price != null ? parseFloat(it.total_price) : qty * price;
            const uom   = it.uom || (it.item_type === 'fabric' ? 'm' : 'pcs');
            const supplierCode = it.item_type !== 'fabric' && it.trim_item_variant_id
                ? (supplierCodes.get(String(it.trim_item_variant_id)) || '')
                : '';
            tableBody.push([
                '',
                subLabel,
                supplierCode,
                `${fmtQty(qty)} ${uom}`,
                fmtMoney(price),
                fmtMoney(total),
            ]);
        });
    });

    const subtotal = items.reduce((s, it) => {
        const t = it.total_price != null ? parseFloat(it.total_price) : (parseFloat(it.quantity || 0) * parseFloat(it.unit_price || 0));
        return s + t;
    }, 0);

    autoTable(doc, {
        startY: y,
        head: [['#', 'Description', 'Code', 'Qty', 'Unit Price', 'Amount']],
        body: tableBody,
        margin: { left: MARGIN, right: MARGIN },
        styles: { fontSize: 9, cellPadding: 6, textColor: accent, lineColor: line, lineWidth: 0.4 },
        headStyles: {
            fillColor: accent,
            textColor: [255, 255, 255],
            fontStyle: 'bold',
            fontSize: 8.5,
            halign: 'left',
        },
        columnStyles: {
            0: { cellWidth: 24, halign: 'center' },
            1: { cellWidth: 'auto' },
            2: { cellWidth: 70 },
            3: { cellWidth: 80, halign: 'right' },
            4: { cellWidth: 70, halign: 'right' },
            5: { cellWidth: 80, halign: 'right' },
        },
    });

    y = doc.lastAutoTable.finalY + 8;

    // ── Totals (right-aligned summary) ───────────────────────────────────────
    const totalsX = COL_R - 200;
    const drawTotalsRow = (label, value, isGrand = false) => {
        doc.setFont('helvetica', isGrand ? 'bold' : 'normal');
        doc.setFontSize(isGrand ? 11 : 9.5);
        doc.setTextColor(...(isGrand ? accent : muted));
        doc.text(label, totalsX, y);
        doc.setTextColor(...accent);
        doc.text(value, COL_R, y, { align: 'right' });
        if (isGrand) {
            doc.setDrawColor(...accent);
            doc.setLineWidth(1.2);
            doc.line(totalsX, y - 14, COL_R, y - 14);
            doc.line(totalsX, y + 4, COL_R, y + 4);
        }
        y += isGrand ? 22 : 14;
    };
    drawTotalsRow('Subtotal', `₹ ${fmtMoney(subtotal)}`);
    drawTotalsRow('Total', `₹ ${fmtMoney(subtotal)}`, true);

    // ── Terms & Bank details (two columns) ───────────────────────────────────
    y += 8;
    const colW = (PAGE_W - 2 * MARGIN - 12) / 2;

    // Terms
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...muted);
    doc.text('TERMS & CONDITIONS', MARGIN, y);

    // Bank
    doc.text('REMIT TO', MARGIN + colW + 12, y);

    doc.setDrawColor(...line);
    doc.setLineWidth(0.4);
    doc.line(MARGIN, y + 3, MARGIN + colW, y + 3);
    doc.line(MARGIN + colW + 12, y + 3, COL_R, y + 3);

    let termsY = y + 16;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...accent);
    const terms = (company?.terms_and_conditions || 'Payment terms as agreed. Goods to match PO specifications. Delivery to ship-to address above.').toString();
    doc.splitTextToSize(terms, colW).slice(0, 10).forEach(ln => {
        doc.text(ln, MARGIN, termsY);
        termsY += 11;
    });

    // REMIT TO — company identity + address (no bank details on a PO).
    let remitY = y + 16;
    const remitLines = [];
    if (company?.legal_name)    remitLines.push({ text: company.legal_name, bold: true });
    if (company?.address_line1) remitLines.push({ text: company.address_line1 });
    if (company?.address_line2) remitLines.push({ text: company.address_line2 });
    const remitCityLine = [company?.city, company?.state, company?.pin_code].filter(Boolean).join(' ');
    if (remitCityLine) {
        remitLines.push({ text: `${remitCityLine}${company?.country ? `, ${company.country}` : ''}` });
    }
    const remitContact = [company?.phone, company?.email].filter(Boolean).join('  ·  ');
    if (remitContact)   remitLines.push({ text: remitContact });
    if (company?.gstin) remitLines.push({ text: `GSTIN: ${company.gstin}` });
    if (company?.pan)   remitLines.push({ text: `PAN: ${company.pan}` });

    if (remitLines.length === 0) {
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(8.5);
        doc.setTextColor(...muted);
        doc.text('Remit-to details on request.', MARGIN + colW + 12, remitY);
        remitY += 12;
    } else {
        const remitMaxWidth = COL_R - (MARGIN + colW + 12);
        remitLines.forEach(({ text, bold }) => {
            doc.setFont('helvetica', bold ? 'bold' : 'normal');
            doc.setFontSize(8.5);
            doc.setTextColor(...accent);
            doc.splitTextToSize(text, remitMaxWidth).forEach(ln => {
                doc.text(ln, MARGIN + colW + 12, remitY);
                remitY += 11;
            });
        });
    }

    y = Math.max(termsY, remitY) + 14;

    // ── Authorized signatory (bottom-right) ──────────────────────────────────
    const sigBoxW = 200;
    const sigBoxH = 76;
    let sigX = COL_R - sigBoxW;
    let sigY = Math.min(y, PAGE_H - MARGIN - sigBoxH - 30);

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
    doc.setLineWidth(0.4);
    doc.line(sigX + 8, sigY + 50, sigX + sigBoxW - 8, sigY + 50);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...accent);
    doc.text(company?.authorized_signatory_name || 'Authorized Signatory', sigX + 8, sigY + 62);
    if (company?.authorized_signatory_designation) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(...muted);
        doc.text(company.authorized_signatory_designation, sigX + 8, sigY + 72);
    }

    // ── Footer ───────────────────────────────────────────────────────────────
    const footerY = PAGE_H - 22;
    doc.setDrawColor(...line);
    doc.setLineWidth(0.4);
    doc.line(MARGIN, footerY - 10, COL_R, footerY - 10);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...muted);
    const stampLine = `Version ${version}  ·  Generated ${new Date().toLocaleString('en', { dateStyle: 'medium', timeStyle: 'short' })}`;
    doc.text(stampLine, MARGIN, footerY);
    doc.text('Page 1 of 1', COL_R, footerY, { align: 'right' });

    return doc.output('blob');
}

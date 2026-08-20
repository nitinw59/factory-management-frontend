// Detailed Sales Order PDF — company letterhead + customer block + full product/
// color/size breakdown + notes + attachments list + linked purchase orders.
// Mirrors the layout conventions of poPdfGenerator.js (same helpers, same visual
// language) but trimmed to what a sales order actually needs — no amount-in-words,
// bank/remit-to, or signatory block.

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { IMAGE_BASE_URL } from '../../../utils/api';

// ── Helpers ──────────────────────────────────────────────────────────────────

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

const loadImage = async (url) => {
    const abs = resolveAssetUrl(url);
    if (!abs) return null;
    return fetchImage(abs);
};

const loadPublicImage = async (path) => {
    if (!path) return null;
    return fetchImage(path);
};

const fmtQty   = (n) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
const fmtDate  = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

// ── Generator ────────────────────────────────────────────────────────────────
//
// `so` is the list-row object (carries purchase_orders + status), `details` is the
// full fetch (customer, products/colors/sizes, notes, attachments). `sizeMap` maps
// size_id → name; `sizeOrder` is the size master's ids in canonical display order
// (both mirror the modal's lookups) — used to lay out the size-breakdown grid in
// the right column order regardless of which color happens to list a size first.
export async function generateSalesOrderPdf({ so, details, sizeMap = {}, sizeOrder = [], company }) {
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const PAGE_W = doc.internal.pageSize.getWidth();
    const PAGE_H = doc.internal.pageSize.getHeight();
    const MARGIN = 40;
    const COL_R  = PAGE_W - MARGIN;

    const accent = [30, 41, 59];      // slate-800
    const muted  = [100, 116, 139];   // slate-500
    const line   = [203, 213, 225];   // slate-300

    const logoImg = company?.logo_url
        ? await loadImage(company.logo_url)
        : await loadPublicImage('/matrix_logo.png');

    let y = MARGIN;

    // Page-break guard for content drawn with raw doc.text() calls — autoTable
    // paginates itself, but the manual section headers between tables don't.
    const ensureSpace = (minH) => {
        if (y + minH > PAGE_H - MARGIN) { doc.addPage(); y = MARGIN; }
    };

    // ── Header band — company letterhead (left) + SALES ORDER title/meta (right) ──
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
    if (company?.gstin) idLines.push(`GSTIN: ${company.gstin}`);

    const idMaxWidth = Math.max(120, (COL_R - 160) - idX);
    let idTextY = y + 28;
    idLines.forEach(ln => {
        doc.splitTextToSize(ln, idMaxWidth).forEach(w => {
            doc.text(w, idX, idTextY);
            idTextY += 10;
        });
    });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.setTextColor(...accent);
    doc.text('SALES ORDER', COL_R, y + 18, { align: 'right' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    const metaRows = [
        { k: 'Order #',   v: so.order_number || details.order_number },
        { k: 'Order Date',v: fmtDate(details.order_date || so.order_date) },
        { k: 'Delivery',  v: fmtDate(details.delivery_date || so.delivery_date), highlight: true },
        { k: 'Status',    v: (details.status || so.status || '').replace(/_/g, ' ') },
    ];
    let metaY = y + 32;
    metaRows.forEach(({ k, v, highlight }) => {
        if (highlight) {
            const bandX = COL_R - 152, bandW = 152;
            doc.setFillColor(254, 243, 199);
            doc.setDrawColor(252, 211, 77);
            doc.setLineWidth(0.4);
            doc.roundedRect(bandX, metaY - 9, bandW, 14, 2, 2, 'FD');
            doc.setTextColor(146, 64, 14);
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
    doc.setDrawColor(...line);
    doc.setLineWidth(0.5);
    doc.line(MARGIN, y, COL_R, y);
    y += 12;

    // ── Customer box ──────────────────────────────────────────────────────────
    const boxStartY = y;
    const TITLE_H = 18, PAD_X = 8, PAD_TOP = 14, PAD_BOT = 8, LINE_H = 11, MIN_BODY = 50;
    const boxW = PAGE_W - 2 * MARGIN;

    const custEntries = [
        (details.customer_name || so.customer_name) && { text: details.customer_name || so.customer_name, bold: true },
        details.customer_email && `Email: ${details.customer_email}`,
        (details.buyer_po_number || so.buyer_po_number) && `Buyer PO: ${details.buyer_po_number || so.buyer_po_number}`,
    ].filter(Boolean);

    const wrapped = [];
    custEntries.forEach(e => {
        const text = typeof e === 'string' ? e : e.text;
        const bold = typeof e === 'object' && !!e.bold;
        doc.setFont('helvetica', bold ? 'bold' : 'normal');
        doc.setFontSize(bold ? 9.5 : 9);
        doc.splitTextToSize(String(text), boxW - 2 * PAD_X).forEach(l => wrapped.push({ text: l, bold }));
    });
    const bodyH = Math.max(MIN_BODY, PAD_TOP + wrapped.length * LINE_H + PAD_BOT);

    doc.setFillColor(...accent);
    doc.rect(MARGIN, y, boxW, TITLE_H, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(255, 255, 255);
    doc.text('CUSTOMER', MARGIN + PAD_X, y + 12);

    doc.setDrawColor(...line);
    doc.setFillColor(248, 250, 252);
    doc.rect(MARGIN, y + TITLE_H, boxW, bodyH, 'FD');
    doc.setTextColor(...accent);
    let cy = y + TITLE_H + PAD_TOP;
    wrapped.forEach(w => {
        doc.setFont('helvetica', w.bold ? 'bold' : 'normal');
        doc.setFontSize(w.bold ? 9.5 : 9);
        doc.text(w.text, MARGIN + PAD_X, cy);
        cy += LINE_H;
    });
    y = boxStartY + TITLE_H + bodyH + 14;

    // ── Order summary band — Products / Colors / Total Pieces ───────────────────
    const products = details.products || [];
    let totalPieces = 0, totalColors = 0;
    products.forEach(prod => {
        const colors = prod.colors || [];
        totalColors += colors.length;
        colors.forEach(c => {
            const fromSizes = (c.sizes || []).reduce((x, sz) => x + (Number(sz.quantity) || 0), 0);
            totalPieces += fromSizes || Number(c.quantity) || 0;
        });
    });

    const SUMMARY_H = 34;
    doc.setFillColor(238, 242, 255);   // indigo-50
    doc.setDrawColor(199, 210, 254);   // indigo-200
    doc.setLineWidth(0.4);
    doc.rect(MARGIN, y, boxW, SUMMARY_H, 'FD');

    const summaryStats = [
        { label: 'Products',     value: products.length },
        { label: 'Colors',       value: totalColors },
        { label: 'Total Pieces', value: fmtQty(totalPieces) },
    ];
    const statW = boxW / summaryStats.length;
    summaryStats.forEach((s, i) => {
        const cx = MARGIN + i * statW + 14;
        if (i > 0) {
            doc.setDrawColor(199, 210, 254);
            doc.line(MARGIN + i * statW, y + 6, MARGIN + i * statW, y + SUMMARY_H - 6);
        }
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(79, 70, 229);   // indigo-600
        doc.text(s.label.toUpperCase(), cx, y + 13);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(14);
        doc.setTextColor(...accent);
        doc.text(String(s.value), cx, y + 27);
    });
    y += SUMMARY_H + 14;

    // ── Notes ─────────────────────────────────────────────────────────────────
    if (details.notes && String(details.notes).trim()) {
        const noteText = String(details.notes).trim();
        const innerPad = 8;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        const lines = doc.splitTextToSize(noteText, boxW - innerPad * 2);
        const labelHeight = 14, lineHeight = 11;
        const noteBoxH = labelHeight + lines.length * lineHeight + innerPad;

        doc.setFillColor(252, 247, 230);
        doc.setDrawColor(...line);
        doc.setLineWidth(0.4);
        doc.rect(MARGIN, y, boxW, noteBoxH, 'FD');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(...muted);
        doc.text('NOTES', MARGIN + innerPad, y + 10);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(...accent);
        let lineY = y + labelHeight + 4;
        lines.forEach(ln => { doc.text(ln, MARGIN + innerPad, lineY); lineY += lineHeight; });

        y += noteBoxH + 14;
    }

    // ── Product / color / size-grid tables — one table per product ───────────
    const HEADER_FILL = [241, 245, 249];
    let anyFlatQtyColor = false;

    products.forEach((prod, pIdx) => {
        const colors = prod.colors || [];
        const prodTotal = colors.reduce((s, c) => {
            const fromSizes = (c.sizes || []).reduce((x, sz) => x + (Number(sz.quantity) || 0), 0);
            return s + (fromSizes || Number(c.quantity) || 0);
        }, 0);

        ensureSpace(70);

        // Section header line: "N. Product Name · Fabric Type" ... "NNN pcs"
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(...accent);
        doc.text(`${pIdx + 1}. ${prod.product_name}${prod.fabric_type ? `  ·  ${prod.fabric_type}` : ''}`, MARGIN, y);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.text(`${fmtQty(prodTotal)} pcs`, COL_R, y, { align: 'right' });
        y += 6;
        doc.setDrawColor(...line);
        doc.setLineWidth(0.5);
        doc.line(MARGIN, y, COL_R, y);
        y += 8;

        if (colors.length === 0) {
            doc.setFont('helvetica', 'italic');
            doc.setFontSize(9);
            doc.setTextColor(...muted);
            doc.text('No colors defined', MARGIN, y + 8);
            y += 20;
            return;
        }

        // Canonical size order for this product: filter the size master's
        // display order down to just the sizes actually used by its colors
        // (falls back to first-seen order if the caller didn't pass sizeOrder).
        const usedIds = new Set();
        colors.forEach(c => (c.sizes || []).forEach(sz => usedIds.add(String(sz.size_id))));
        let sizeUnion;
        if (sizeOrder.length > 0) {
            sizeUnion = sizeOrder.filter(id => usedIds.has(id)).map(id => ({ id, name: sizeMap[id] || id }));
        } else {
            sizeUnion = [];
            const seen = new Set();
            colors.forEach(c => (c.sizes || []).forEach(sz => {
                const key = String(sz.size_id);
                if (!seen.has(key)) { seen.add(key); sizeUnion.push({ id: key, name: sizeMap[key] || sz.size_name || `#${key}` }); }
            }));
        }

        const colorLabel = c => `${c.color_name}${c.color_number ? ` (${c.color_number})` : ''}`;

        if (sizeUnion.length === 0) {
            // No color on this product has a size breakdown — simple Color | Qty table.
            const body = colors.map(c => [colorLabel(c), fmtQty(Number(c.quantity) || 0)]);
            body.push([{ content: 'TOTAL', styles: { fontStyle: 'bold', fillColor: HEADER_FILL } },
                       { content: fmtQty(prodTotal), styles: { fontStyle: 'bold', fillColor: HEADER_FILL, halign: 'right' } }]);
            autoTable(doc, {
                startY: y,
                head: [['Color', 'Qty']],
                body,
                margin: { left: MARGIN, right: MARGIN },
                styles: { fontSize: 8.5, cellPadding: 6, textColor: accent, lineColor: line, lineWidth: 0.4 },
                headStyles: { fillColor: accent, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8.5, halign: 'left' },
                columnStyles: { 1: { halign: 'right' } },
            });
        } else {
            // Size-grid table: one column per size actually used by this product's colors.
            const sizeTotals = sizeUnion.map(() => 0);
            const body = colors.map(c => {
                const byId = new Map((c.sizes || []).map(sz => [String(sz.size_id), Number(sz.quantity) || 0]));
                const hasBreakdown = (c.sizes || []).length > 0;
                if (!hasBreakdown) anyFlatQtyColor = true;
                const cells = sizeUnion.map((s, i) => {
                    if (!hasBreakdown) return '-';
                    const qty = byId.get(s.id) || 0;
                    sizeTotals[i] += qty;
                    return byId.has(s.id) ? fmtQty(qty) : '-';
                });
                const rowTotal = hasBreakdown
                    ? (c.sizes || []).reduce((s, sz) => s + (Number(sz.quantity) || 0), 0)
                    : (Number(c.quantity) || 0);
                return [colorLabel(c), ...cells, fmtQty(rowTotal)];
            });
            body.push([
                { content: 'TOTAL', styles: { fontStyle: 'bold', fillColor: HEADER_FILL } },
                ...sizeTotals.map(t => ({ content: fmtQty(t), styles: { fontStyle: 'bold', fillColor: HEADER_FILL, halign: 'right' } })),
                { content: fmtQty(prodTotal), styles: { fontStyle: 'bold', fillColor: HEADER_FILL, halign: 'right' } },
            ]);

            const columnStyles = { 0: { cellWidth: 110 } };
            columnStyles[sizeUnion.length + 1] = { cellWidth: 50, halign: 'right', fontStyle: 'bold' };

            autoTable(doc, {
                startY: y,
                head: [['Color', ...sizeUnion.map(s => s.name), 'Total']],
                body,
                margin: { left: MARGIN, right: MARGIN },
                styles: { fontSize: 8.5, cellPadding: 5, textColor: accent, lineColor: line, lineWidth: 0.4, halign: 'right' },
                headStyles: { fillColor: accent, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8.5, halign: 'center' },
                columnStyles,
            });
        }

        y = doc.lastAutoTable.finalY + 16;
    });

    if (anyFlatQtyColor) {
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(7.5);
        doc.setTextColor(...muted);
        doc.text('* One or more colors above have no size-level breakdown — shown as "-" per size, with the flat quantity in Total.', MARGIN, y - 8);
    }

    // ── Attachments ───────────────────────────────────────────────────────────
    const attachments = details.attachments || [];
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...muted);
    doc.text('DOCUMENTS & ATTACHMENTS', MARGIN, y);
    y += 6;
    doc.setDrawColor(...line);
    doc.setLineWidth(0.4);
    doc.line(MARGIN, y, COL_R, y);
    y += 12;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...accent);
    if (attachments.length === 0) {
        doc.setFont('helvetica', 'italic');
        doc.setTextColor(...muted);
        doc.text('No documents attached.', MARGIN, y);
        y += 14;
    } else {
        attachments.forEach(att => {
            const label = `•  ${att.original_filename || att.original_name || att.filename || att.name || 'File'}`;
            doc.splitTextToSize(label, boxW).forEach(ln => { doc.text(ln, MARGIN, y); y += 12; });
        });
        y += 4;
    }

    // ── Linked purchase orders ───────────────────────────────────────────────
    const purchaseOrders = so.purchase_orders || [];
    if (purchaseOrders.length > 0) {
        y += 4;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(...muted);
        doc.text('LINKED PURCHASE ORDERS', MARGIN, y);
        y += 4;

        autoTable(doc, {
            startY: y + 4,
            head: [['PO Code', 'Supplier', 'Status', 'Materials']],
            body: purchaseOrders.map(po => [
                po.po_code || po.po_number || `PO-${po.id}`,
                po.supplier_name || '—',
                (po.status || '').replace(/_/g, ' ') || '—',
                po.material_summary || '—',
            ]),
            margin: { left: MARGIN, right: MARGIN },
            styles: { fontSize: 8.5, cellPadding: 5, textColor: accent, lineColor: line, lineWidth: 0.4 },
            headStyles: { fillColor: [71, 85, 105], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8, halign: 'left' },
        });
        y = doc.lastAutoTable.finalY + 10;
    }

    // ── Footer (every page) ──────────────────────────────────────────────────
    const pageCount = doc.internal.getNumberOfPages();
    for (let p = 1; p <= pageCount; p++) {
        doc.setPage(p);
        const footerY = PAGE_H - 22;
        doc.setDrawColor(...line);
        doc.setLineWidth(0.4);
        doc.line(MARGIN, footerY - 10, COL_R, footerY - 10);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(...muted);
        doc.text(`Generated ${new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}`, MARGIN, footerY);
        doc.text(`Page ${p} of ${pageCount}`, COL_R, footerY, { align: 'right' });
    }

    return doc.output('blob');
}

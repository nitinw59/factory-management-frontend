// Purchase order print (16 Oct 2026, asked: "generated PO PDF and Excel very raw … company logo and horizontal
// layout is compulsory"; layout modelled on SAP's purchasing form — letterhead, info, address blocks, item table,
// conditions / totals, first page vs next pages). A4 landscape, the company logo on every page.
//
//   Page 1    letterhead (logo, company, GSTIN · PAN · CIN, contact) | PURCHASE ORDER · PO no. · date · revision
//             four boxes: Supplier · Bill to · Ship to · Order details (payment / delivery terms, your ref., tax)
//   Items     Sr · item & description · HSN · delivery · qty · unit · rate · taxable · GST % · CGST + SGST | IGST · amount
//             (heading repeated; next pages carry a slim header with the logo and the PO no.)
//   End       amount in words + HSN-wise tax summary | totals; numbered terms; supplier acknowledgement | for <company>
//   Footer    registered office · computer-generated · page x of N; DRAFT / CANCELLED stamped across the page
// Excel: the same layout as a formatted sheet with live formulas (taxable, GST, totals, HSN summary), set up to print
// A4 landscape; the line data stays on a second sheet.
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { inr, amountInWords } from './poShared';
import { newWorkbook, saveWorkbook, THIN } from '../components/xlsxSave';

const M = 10;                                   // page margin (mm)
const INK = [15, 23, 42];
const MUTED = [100, 116, 139];
const RULE = [203, 213, 225];
const SHADE = [241, 245, 249];
const qty = (n) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 3 });
const dmy = (iso) => (iso ? iso.split('-').reverse().join('/') : '');
const fileBase = (po) => `PurchaseOrder-${po.po_no.replace(/[^\w-]+/g, '-')}${po.revision_no ? `-rev${po.revision_no}` : ''}`;
const joinLines = (...xs) => xs.filter(Boolean).join('\n');
const stamp = (po) => (po.status === 'CANCELLED' ? 'CANCELLED' : ['DRAFT', 'PENDING_APPROVAL'].includes(po.status) ? 'DRAFT' : null);

// The four address / detail boxes, as text (PDF and Excel share them).
function boxes(po, company) {
    const intra = po.tax_mode === 'INTRA';
    const supplier = joinLines(
        po.supplier_name,
        po.supplier_address,
        [po.supplier_city, po.supplier_pincode].filter(Boolean).join(' '),
        `GSTIN: ${po.supplier_gstin || 'unregistered'}`,
        `State: ${po.supplier_state_name || ''} (${po.supplier_state_code || ''})`,
        po.supplier_contact || po.supplier_phone || po.supplier_email ? `Contact: ${[po.supplier_contact, po.supplier_phone, po.supplier_email].filter(Boolean).join(', ')}` : null,
    );
    const da = po.delivery_address;
    const billGstin = da?.gstin || company?.gstin;
    const billTo = joinLines(
        company?.legal_name || company?.trade_name || '',
        da?.gstin ? `${da.name} — ${[da.address_line1, da.address_line2, da.city, da.pin_code].filter(Boolean).join(', ')}` : [company?.address_line1, company?.address_line2, company?.city, company?.pin_code].filter(Boolean).join(', '),
        billGstin ? `GSTIN: ${billGstin}` : null,
        `State: ${po.company_state_name || company?.state || ''} (${po.company_state_code || company?.state_code || ''})`,
        company?.pan ? `PAN: ${company.pan}` : null,
    );
    const shipTo = da
        ? joinLines(da.name, [da.address_line1, da.address_line2].filter(Boolean).join(', '), [da.city, da.state, da.pin_code].filter(Boolean).join(', '), da.gstin ? `GSTIN: ${da.gstin}` : null)
        : joinLines(company?.trade_name || company?.legal_name || '', [company?.address_line1, company?.address_line2].filter(Boolean).join(', '), [company?.city, company?.state, company?.pin_code].filter(Boolean).join(', '));
    const pc = po.purchase_contact;
    const details = joinLines(
        `Payment terms: ${po.payment_terms_days} days`,
        po.delivery_terms ? `Delivery terms: ${po.delivery_terms}` : null,
        `Delivery date: ${po.delivery_date ? dmy(po.delivery_date) : 'per line'}`,
        po.supplier_reference ? `Your ref.: ${po.supplier_reference}` : null,
        `Tax: ${intra ? 'CGST + SGST (same state)' : 'IGST (inter-state)'}`,
        pc ? `Buyer: ${[pc.name, pc.phone, pc.email].filter(Boolean).join(', ')}` : null,
    );
    return [['SUPPLIER', supplier], ['BILL TO', billTo], ['SHIP TO', shipTo], ['ORDER DETAILS', details]];
}

// HSN-wise tax summary (as on a GST invoice).
function hsnSummary(po) {
    const intra = po.tax_mode === 'INTRA';
    const m = new Map();
    for (const l of po.lines) {
        const k = `${l.hsn_code || '—'}|${l.gst_pct}`;
        const r = m.get(k) || { hsn: l.hsn_code || '—', gst: l.gst_pct, taxable: 0, cgst: 0, sgst: 0, igst: 0 };
        r.taxable += l.value; r.cgst += l.cgst; r.sgst += l.sgst; r.igst += l.igst;
        m.set(k, r);
    }
    return { intra, rows: [...m.values()].sort((a, b) => String(a.hsn).localeCompare(String(b.hsn)) || a.gst - b.gst) };
}

const termLines = (terms) => String(terms || '').split(/\r?\n/).map(t => t.trim()).filter(Boolean)
    .map((t, i) => (/^\d+[.)]/.test(t) ? t : `${i + 1}. ${t}`));

// ── PDF ──────────────────────────────────────────────────────────────────
// assets: { logo, signature, seal } — { dataUrl, format, w, h } from the company profile (logo compulsory: the caller
// falls back to the app logo).
export function exportPoPdf(po, company, assets = {}) {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();
    const intra = po.tax_mode === 'INTRA';
    const name = company?.trade_name || company?.legal_name || '';
    const img = (a, x, y, maxW, maxH) => {
        if (!a) return 0;
        const r = Math.min(maxW / a.w, maxH / a.h);
        try { doc.addImage(a.dataUrl, a.format, x, y, a.w * r, a.h * r, undefined, 'FAST'); return a.w * r; } catch { return 0; }
    };
    const set = (size, style = 'normal', color = INK) => { doc.setFontSize(size); doc.setFont('helvetica', style); doc.setTextColor(...color); };

    // Page 1 letterhead; returns the y below it.
    const firstHeader = () => {
        const lw = img(assets.logo, M, 8, 55, 20);
        const x = M + (lw ? lw + 5 : 0);
        set(15, 'bold'); doc.text(name, x, 13);
        set(8, 'normal', MUTED);
        const lines = [
            company?.trade_name && company?.legal_name && company.legal_name !== company.trade_name ? company.legal_name : null,
            [company?.address_line1, company?.address_line2, company?.city, company?.state, company?.pin_code].filter(Boolean).join(', '),
            [company?.gstin ? `GSTIN ${company.gstin}` : null, company?.pan ? `PAN ${company.pan}` : null, company?.cin ? `CIN ${company.cin}` : null].filter(Boolean).join('  ·  '),
            [company?.phone, company?.email, company?.website].filter(Boolean).join('  ·  '),
        ].filter(Boolean);
        lines.forEach((t, i) => doc.text(t, x, 17.5 + i * 3.8, { maxWidth: W / 2 - 10 }));
        // title block, right
        set(18, 'bold'); doc.text('PURCHASE ORDER', W - M, 14, { align: 'right' });
        set(9, 'normal');
        const kv = [['PO no.', `${po.po_no}${po.revision_no ? `  (rev ${po.revision_no})` : ''}`], ['PO date', dmy(po.po_date)], ...(po.issued_at ? [['Issued', new Date(po.issued_at).toLocaleDateString('en-IN')]] : [])];
        // values right-aligned; labels in one column left of the widest value (long PO numbers never overlap)
        set(9, 'bold'); const vw = Math.max(...kv.map(([, v]) => doc.getTextWidth(v)));
        kv.forEach(([k, v], i) => {
            set(9, 'bold'); doc.text(v, W - M, 20 + i * 4.4, { align: 'right' });
            set(8, 'normal', MUTED); doc.text(k, W - M - vw - 4, 20 + i * 4.4, { align: 'right' });
        });
        const y = Math.max(31, 17.5 + lines.length * 3.8 + 2);
        doc.setDrawColor(...INK); doc.setLineWidth(0.6); doc.line(M, y, W - M, y);
        return y + 3;
    };
    // Pages 2…: slim header.
    const nextHeader = () => {
        const lw = img(assets.logo, M, 6, 30, 9);
        set(10, 'bold'); doc.text(name, M + (lw ? lw + 4 : 0), 11.5);
        set(10, 'bold'); doc.text(`PURCHASE ORDER  ${po.po_no}${po.revision_no ? ` (rev ${po.revision_no})` : ''}`, W - M, 11.5, { align: 'right' });
        doc.setDrawColor(...RULE); doc.setLineWidth(0.3); doc.line(M, 16, W - M, 16);
    };

    let y = firstHeader();
    // Four boxes
    const bx = boxes(po, company);
    autoTable(doc, {
        startY: y, theme: 'grid', margin: { left: M, right: M },
        head: [bx.map(b => b[0])], body: [bx.map(b => b[1])],
        styles: { fontSize: 7.8, cellPadding: 2, valign: 'top', textColor: INK, lineColor: RULE, lineWidth: 0.2 },
        headStyles: { fillColor: SHADE, textColor: MUTED, fontStyle: 'bold', fontSize: 7 },
        columnStyles: { 0: { cellWidth: (W - 2 * M) * 0.27 }, 1: { cellWidth: (W - 2 * M) * 0.25 }, 2: { cellWidth: (W - 2 * M) * 0.23 } },
        didParseCell: (d) => { if (d.section === 'body' && d.row.index === 0) d.cell.styles.fontStyle = 'normal'; },
    });
    y = doc.lastAutoTable.finalY + 4;

    // Items
    const taxHead = intra ? ['CGST', 'SGST'] : ['IGST'];
    // the quantity is in its own column; the usage quantity only when the purchase unit differs (gross → pcs, cone → m)
    const desc = (l) => joinLines(l.type_name, l.factor !== 1 ? `= ${qty(l.usage_qty)} ${l.uom}` : null, l.notes);
    autoTable(doc, {
        startY: y, theme: 'striped', margin: { left: M, right: M, top: 20, bottom: 16 }, showHead: 'everyPage', showFoot: 'lastPage', rowPageBreak: 'avoid',
        head: [['Sr', 'Item & description', 'HSN', 'Delivery', 'Qty', 'Unit', 'Rate (Rs.)', 'Taxable (Rs.)', 'GST %', ...taxHead.map(t => `${t} (Rs.)`), 'Amount (Rs.)']],
        body: po.lines.map(l => [l.line_no, { content: `${l.label}\n${desc(l)}` }, l.hsn_code || '—', dmy(l.delivery_date || po.delivery_date) || '—', qty(l.qty), l.purchase_uom, inr(l.rate), inr(l.value), `${l.gst_pct}%`,
            ...(intra ? [inr(l.cgst), inr(l.sgst)] : [inr(l.igst)]), inr(l.total)]),
        foot: [['', 'Total', '', '', '', '', '', inr(po.totals.taxable), '', ...(intra ? [inr(po.totals.cgst), inr(po.totals.sgst)] : [inr(po.totals.igst)]), inr(po.totals.total)]],
        styles: { fontSize: 7.8, cellPadding: 1.8, valign: 'top', textColor: INK, lineColor: RULE, lineWidth: 0.1 },
        headStyles: { fillColor: [226, 232, 240], textColor: INK, fontStyle: 'bold', fontSize: 7.5, halign: 'center', lineColor: RULE, lineWidth: 0.2 },   // light heading (16 Oct 2026)
        footStyles: { fillColor: SHADE, textColor: INK, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: { 0: { cellWidth: 9, halign: 'center' }, 1: { cellWidth: 'auto' }, 2: { cellWidth: 17 }, 3: { cellWidth: 19 }, 4: { cellWidth: 17, halign: 'right' }, 5: { cellWidth: 12 },
            6: { cellWidth: 20, halign: 'right' }, 7: { cellWidth: 24, halign: 'right' }, 8: { cellWidth: 13, halign: 'right' },
            9: { cellWidth: 21, halign: 'right' }, 10: { cellWidth: intra ? 21 : 26, halign: 'right' }, ...(intra ? { 11: { cellWidth: 26, halign: 'right' } } : {}) },
        didParseCell: (d) => {
            if (d.section === 'body' && d.column.index === 1) d.cell.styles.fontStyle = 'normal';
            if (d.section === 'foot' && d.column.index >= 7) d.cell.styles.halign = 'right';
        },
        didDrawCell: (d) => {   // item name in bold on the first line of the description cell
            if (d.section === 'body' && d.column.index === 1) {
                const l = po.lines[d.row.index];
                set(7.8, 'bold');
                if (doc.getTextWidth(String(l.label)) > d.cell.width - 3.6) { set(7.8, 'normal'); return; }   // a wrapped name stays as it is
                const bg = d.cell.styles.fillColor;   // the row's own colour (striped rows), so no band shows behind the name
                doc.setFillColor(...(Array.isArray(bg) ? bg : typeof bg === 'number' ? [bg, bg, bg] : [255, 255, 255]));
                doc.rect(d.cell.x + 0.3, d.cell.y + 0.3, d.cell.width - 0.6, 4.2, 'F');
                doc.text(String(l.label), d.cell.x + 1.8, d.cell.y + 1.8 + 2.4, { maxWidth: d.cell.width - 3.6 });
            }
        },
        didDrawPage: (d) => { if (d.pageNumber > 1) nextHeader(); },
    });
    y = doc.lastAutoTable.finalY + 5;

    // Amount in words + HSN summary (left) | totals (right)
    const need = 28 + hsnSummary(po).rows.length * 5;
    if (y + need > H - 18) { doc.addPage(); nextHeader(); y = 22; }
    const leftW = (W - 2 * M) * 0.6;
    set(8, 'bold'); doc.text('Amount in words', M, y);
    set(8.5, 'normal'); doc.text(amountInWords(po.totals.total), M, y + 4.2, { maxWidth: leftW });
    const hs = hsnSummary(po);
    autoTable(doc, {
        startY: y + 8, theme: 'grid', margin: { left: M, right: W - M - leftW }, tableWidth: leftW,
        head: [['HSN', 'GST %', 'Taxable (Rs.)', ...(hs.intra ? ['CGST (Rs.)', 'SGST (Rs.)'] : ['IGST (Rs.)']), 'Total tax (Rs.)']],
        body: hs.rows.map(r => [r.hsn, `${r.gst}%`, inr(r.taxable), ...(hs.intra ? [inr(r.cgst), inr(r.sgst)] : [inr(r.igst)]), inr(r.cgst + r.sgst + r.igst)]),
        styles: { fontSize: 7.5, cellPadding: 1.4, textColor: INK, lineColor: RULE, lineWidth: 0.2 },
        headStyles: { fillColor: SHADE, textColor: MUTED, fontStyle: 'bold' },
        columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' } },
    });
    const leftEnd = doc.lastAutoTable.finalY;
    const totW = (W - 2 * M) * 0.32;
    autoTable(doc, {
        startY: y, theme: 'plain', margin: { left: W - M - totW, right: M }, tableWidth: totW,
        body: [['Taxable value', inr(po.totals.taxable)], ...(intra ? [['CGST', inr(po.totals.cgst)], ['SGST', inr(po.totals.sgst)]] : [['IGST', inr(po.totals.igst)]]),
            [{ content: 'GRAND TOTAL (Rs.)', styles: { fontStyle: 'bold', fillColor: INK, textColor: [255, 255, 255], fontSize: 10 } }, { content: inr(po.totals.total), styles: { fontStyle: 'bold', fillColor: INK, textColor: [255, 255, 255], fontSize: 10, halign: 'right' } }]],
        styles: { fontSize: 8.5, cellPadding: 1.8, textColor: INK }, columnStyles: { 1: { halign: 'right' } },
        didDrawCell: (d) => { if (d.row.index < (intra ? 3 : 2)) { doc.setDrawColor(...RULE); doc.setLineWidth(0.2); doc.line(d.cell.x, d.cell.y + d.cell.height, d.cell.x + d.cell.width, d.cell.y + d.cell.height); } },
    });
    y = Math.max(leftEnd, doc.lastAutoTable.finalY) + 6;

    // Terms
    const terms = termLines(po.terms);
    if (terms.length) {
        const wrapped = terms.flatMap(t => doc.splitTextToSize(t, W - 2 * M));
        if (y + 6 + wrapped.length * 3.6 > H - 50) { doc.addPage(); nextHeader(); y = 22; }
        set(8.5, 'bold'); doc.text('TERMS AND CONDITIONS', M, y);
        set(7.8, 'normal'); doc.text(wrapped, M, y + 4.5, { lineHeightFactor: 1.35 });
        y += 6 + wrapped.length * 3.6;
    }

    // Supplier acknowledgement | for <company>
    if (y + 34 > H - 16) { doc.addPage(); nextHeader(); y = 22; }
    const boxW = (W - 2 * M - 10) / 2;
    doc.setDrawColor(...RULE); doc.setLineWidth(0.3);
    doc.rect(M, y, boxW, 32); doc.rect(M + boxW + 10, y, boxW, 32);
    set(8, 'bold'); doc.text('SUPPLIER ACKNOWLEDGEMENT', M + 3, y + 5);
    set(7.8, 'normal', MUTED); doc.text('We accept this purchase order and its terms.', M + 3, y + 9.5);
    doc.text('Signature & stamp', M + 3, y + 28); doc.text('Date', M + boxW - 30, y + 28);
    const rx = M + boxW + 10;
    set(8, 'bold'); doc.text(`For ${name}`, rx + boxW - 3, y + 5, { align: 'right' });
    if (assets.seal) img(assets.seal, rx + boxW - 72, y + 8, 18, 18);
    if (assets.signature) img(assets.signature, rx + boxW - 45, y + 9, 40, 14);
    const ds = po.doc_settings || {};
    set(8, 'normal'); doc.text(ds.signatory_name ? `${ds.signatory_name}${ds.signatory_designation ? `, ${ds.signatory_designation}` : ''}` : 'Authorised signatory', rx + boxW - 3, y + 26, { align: 'right' });
    if (ds.signatory_name) { set(7, 'normal', MUTED); doc.text('Authorised signatory', rx + boxW - 3, y + 29.5, { align: 'right' }); }

    // Footer, page numbers, stamp
    const pages = doc.getNumberOfPages();
    const office = [company?.legal_name || name, [company?.address_line1, company?.city, company?.state, company?.pin_code].filter(Boolean).join(', ')].filter(Boolean).join(' — ');
    const mark = stamp(po);
    for (let i = 1; i <= pages; i++) {
        doc.setPage(i);
        doc.setDrawColor(...RULE); doc.setLineWidth(0.3); doc.line(M, H - 11, W - M, H - 11);
        set(7, 'normal', MUTED);
        doc.text(`Registered office: ${office}`, M, H - 7, { maxWidth: W / 2 });
        doc.text('This is a computer-generated purchase order.', W / 2, H - 7, { align: 'center' });
        doc.text(`${po.po_no}${po.revision_no ? ` rev ${po.revision_no}` : ''} · Page ${i} of ${pages}`, W - M, H - 7, { align: 'right' });
        if (mark) {
            try {
                doc.saveGraphicsState(); doc.setGState(new doc.GState({ opacity: 0.12 }));
                set(110, 'bold', [190, 18, 60]); doc.text(mark, W / 2, H / 2 + 20, { align: 'center', angle: 25 });
                doc.restoreGraphicsState();
            } catch { /* no transparency: skip the stamp */ }
            set(8, 'bold', [190, 18, 60]);
            if (i === 1) doc.text(mark === 'DRAFT' ? 'DRAFT — not issued, not valid for supply' : `CANCELLED: ${po.cancelled_reason || ''}`, W - M, 33.5, { align: 'right' });
        }
    }
    doc.setTextColor(0, 0, 0);
    doc.save(`${fileBase(po)}.pdf`);
    return doc;
}

// ── Excel ────────────────────────────────────────────────────────────────
const FONT = { name: 'Arial', size: 9 };
const BOLD = { ...FONT, bold: true };
const RULED = { top: THIN, left: THIN, bottom: THIN, right: THIN };
const LIGHT = { style: 'thin', color: { argb: 'FFCBD5E1' } };
const LIGHT_BOX = { top: LIGHT, left: LIGHT, bottom: LIGHT, right: LIGHT };
const NUM = '#,##0.00';
const colL = (n) => { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };

export async function exportPoExcel(po, company, assets = {}) {
    const intra = po.tax_mode === 'INTRA';
    const wb = await newWorkbook();
    wb.calcProperties = { ...(wb.calcProperties || {}), fullCalcOnLoad: true };   // formulas recalculate when the file opens
    const ws = wb.addWorksheet('Purchase order', {
        pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } },
        headerFooter: { oddFooter: `&L${po.po_no}&CThis is a computer-generated purchase order.&RPage &P of &N` },
        views: [{ showGridLines: false }],
    });
    // Columns: A Sr · B Item · C HSN · D Delivery · E Qty · F Unit · G Rate · H Taxable · I GST % · J CGST|IGST · K SGST · L Amount
    const cols = intra ? ['Sr', 'Item & description', 'HSN', 'Delivery', 'Qty', 'Unit', 'Rate (₹)', 'Taxable (₹)', 'GST %', 'CGST (₹)', 'SGST (₹)', 'Amount (₹)']
        : ['Sr', 'Item & description', 'HSN', 'Delivery', 'Qty', 'Unit', 'Rate (₹)', 'Taxable (₹)', 'GST %', 'IGST (₹)', 'Amount (₹)'];
    const N = cols.length;
    ws.columns = (intra ? [6, 46, 11, 12, 11, 8, 12, 15, 8, 13, 13, 16] : [6, 50, 11, 12, 11, 8, 12, 15, 8, 15, 17]).map(width => ({ width }));
    const cell = (r, c, v, style = {}) => { const x = ws.getCell(r, c); x.value = v ?? ''; x.font = style.font || FONT; x.alignment = { vertical: 'top', horizontal: style.align || 'left', wrapText: style.wrap ?? true }; if (style.fill) x.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: style.fill } }; if (style.fmt) x.numFmt = style.fmt; if (style.border) x.border = style.border; return x; };
    const merge = (r1, c1, r2, c2) => { if (r2 > r1 || c2 > c1) ws.mergeCells(r1, c1, r2, c2); };

    // Letterhead rows 1–5: logo (A–B), company (B…), title + PO no. / date (right)
    const name = company?.trade_name || company?.legal_name || '';
    let textCol = 1;
    if (assets.logo) {
        try {
            const id = wb.addImage({ base64: assets.logo.dataUrl, extension: assets.logo.format === 'JPEG' ? 'jpeg' : 'png' });
            const h = 64; const w = Math.min(190, (h * assets.logo.w) / assets.logo.h);
            ws.addImage(id, { tl: { col: 0.1, row: 0.15 }, ext: { width: w, height: h } });
            textCol = 2;
        } catch { /* unreadable logo: name only */ }
    }
    const titleFrom = N - 3;
    const sub = [
        company?.trade_name && company?.legal_name && company.legal_name !== company.trade_name ? company.legal_name : null,
        [company?.address_line1, company?.address_line2, company?.city, company?.state, company?.pin_code].filter(Boolean).join(', '),
        [company?.gstin ? `GSTIN ${company.gstin}` : null, company?.pan ? `PAN ${company.pan}` : null, company?.cin ? `CIN ${company.cin}` : null].filter(Boolean).join('  ·  '),
        [company?.phone, company?.email, company?.website].filter(Boolean).join('  ·  '),
    ].filter(Boolean);
    merge(1, textCol, 1, titleFrom - 1); cell(1, textCol, name, { font: { ...BOLD, size: 15 }, align: textCol === 2 ? 'left' : 'left' });
    sub.slice(0, 4).forEach((t, i) => { merge(2 + i, textCol, 2 + i, titleFrom - 1); cell(2 + i, textCol, t, { font: { ...FONT, size: 8, color: { argb: 'FF64748B' } } }); });
    merge(1, titleFrom, 1, N); cell(1, titleFrom, 'PURCHASE ORDER', { font: { ...BOLD, size: 16 }, align: 'right' });
    const kv = [['PO no.', `${po.po_no}${po.revision_no ? `  (rev ${po.revision_no})` : ''}`], ['PO date', dmy(po.po_date)], ...(po.issued_at ? [['Issued', new Date(po.issued_at).toLocaleDateString('en-IN')]] : [])];
    kv.forEach(([k, v], i) => { merge(2 + i, titleFrom, 2 + i, titleFrom + 1); cell(2 + i, titleFrom, k, { font: { ...FONT, color: { argb: 'FF64748B' } }, align: 'right' }); merge(2 + i, titleFrom + 2, 2 + i, N); cell(2 + i, titleFrom + 2, v, { font: BOLD, align: 'right' }); });
    const mark = stamp(po);
    if (mark) { merge(5, titleFrom, 5, N); cell(5, titleFrom, mark === 'DRAFT' ? 'DRAFT — not issued, not valid for supply' : `CANCELLED: ${po.cancelled_reason || ''}`, { font: { ...BOLD, color: { argb: 'FFBE123C' } }, align: 'right' }); }
    ws.getRow(1).height = 22;
    for (let c = 1; c <= N; c++) ws.getCell(6, c).border = { bottom: { style: 'medium', color: { argb: 'FF0F172A' } } };

    // Four boxes (row 8 heading, row 9 text)
    const bx = boxes(po, company);
    const spans = intra ? [[1, 2], [3, 6], [7, 9], [10, 12]] : [[1, 2], [3, 6], [7, 8], [9, 11]];
    bx.forEach(([h, t], i) => {
        const [a, b] = spans[i];
        merge(8, a, 8, b); cell(8, a, h, { font: { ...BOLD, size: 8, color: { argb: 'FF64748B' } }, fill: 'FFF1F5F9' });
        merge(9, a, 9, b); cell(9, a, t, { font: { ...FONT, size: 8.5 } });
        for (let c = a; c <= b; c++) { ws.getCell(8, c).border = LIGHT_BOX; ws.getCell(9, c).border = LIGHT_BOX; }
    });
    ws.getRow(9).height = Math.max(...bx.map(([, t]) => t.split('\n').length)) * 12 + 6;

    // Item table (heading row 11), live formulas
    const HEAD = 11;
    cols.forEach((h, i) => cell(HEAD, i + 1, h, { font: BOLD, fill: 'FFE2E8F0', align: i >= 4 ? 'center' : 'left', border: RULED }));   // light heading, as the PDF
    ws.getRow(HEAD).height = 18;
    const first = HEAD + 1;
    po.lines.forEach((l, i) => {
        const r = first + i;
        const z = i % 2 ? 'FFF8FAFC' : null;
        const desc = joinLines(l.label, l.type_name, l.factor !== 1 ? `= ${qty(l.usage_qty)} ${l.uom}` : null, l.notes);
        const vals = [
            [l.line_no, { align: 'center' }], [desc, {}], [l.hsn_code || '—', {}], [dmy(l.delivery_date || po.delivery_date) || '—', {}],
            [l.qty, { align: 'right', fmt: '#,##0.###' }], [l.purchase_uom, {}], [l.rate, { align: 'right', fmt: NUM }],
            [{ formula: `E${r}*G${r}`, result: l.value }, { align: 'right', fmt: NUM }], [l.gst_pct, { align: 'right', fmt: '0.##"%"' }],
            ...(intra ? [[{ formula: `ROUND(H${r}*I${r}/200,2)`, result: l.cgst }, { align: 'right', fmt: NUM }], [{ formula: `ROUND(H${r}*I${r}/200,2)`, result: l.sgst }, { align: 'right', fmt: NUM }]]
                : [[{ formula: `ROUND(H${r}*I${r}/100,2)`, result: l.igst }, { align: 'right', fmt: NUM }]]),
            [{ formula: intra ? `H${r}+J${r}+K${r}` : `H${r}+J${r}`, result: l.total }, { align: 'right', fmt: NUM, font: BOLD }],
        ];
        vals.forEach(([v, st], c) => cell(r, c + 1, v, { ...st, fill: z, border: LIGHT_BOX }));
        ws.getCell(r, 2).font = FONT;
        ws.getRow(r).height = Math.max(1, desc.split('\n').length) * 12 + 4;
    });
    const last = first + po.lines.length - 1;
    const T = last + 1;
    merge(T, 1, T, 7); cell(T, 1, 'Total', { font: BOLD, fill: 'FFF1F5F9', border: RULED });
    const sumCol = (c) => ({ formula: `SUM(${colL(c)}${first}:${colL(c)}${last})` });
    cell(T, 8, { ...sumCol(8), result: po.totals.taxable }, { font: BOLD, fmt: NUM, align: 'right', fill: 'FFF1F5F9', border: RULED });
    cell(T, 9, '', { fill: 'FFF1F5F9', border: RULED });
    if (intra) {
        cell(T, 10, { ...sumCol(10), result: po.totals.cgst }, { font: BOLD, fmt: NUM, align: 'right', fill: 'FFF1F5F9', border: RULED });
        cell(T, 11, { ...sumCol(11), result: po.totals.sgst }, { font: BOLD, fmt: NUM, align: 'right', fill: 'FFF1F5F9', border: RULED });
    } else cell(T, 10, { ...sumCol(10), result: po.totals.igst }, { font: BOLD, fmt: NUM, align: 'right', fill: 'FFF1F5F9', border: RULED });
    cell(T, N, { ...sumCol(N), result: po.totals.total }, { font: BOLD, fmt: NUM, align: 'right', fill: 'FFF1F5F9', border: RULED });

    // Amount in words + HSN summary (left) | totals (right)
    let r = T + 2;
    merge(r, 1, r, 7); cell(r, 1, 'Amount in words', { font: BOLD });
    merge(r + 1, 1, r + 1, 7); cell(r + 1, 1, amountInWords(po.totals.total), { font: { ...FONT, italic: true } });
    const totRows = [['Taxable value', `H${T}`, po.totals.taxable], ...(intra ? [['CGST', `J${T}`, po.totals.cgst], ['SGST', `K${T}`, po.totals.sgst]] : [['IGST', `J${T}`, po.totals.igst]]), ['GRAND TOTAL (₹)', `${colL(N)}${T}`, po.totals.total]];
    const totLabel = N - 3;
    totRows.forEach(([k, ref, val], i) => {
        const grand = i === totRows.length - 1;
        merge(r + i, totLabel, r + i, N - 1);
        cell(r + i, totLabel, k, { font: grand ? { ...BOLD, color: { argb: 'FFFFFFFF' } } : FONT, fill: grand ? 'FF0F172A' : null, align: 'right', border: LIGHT_BOX });
        cell(r + i, N, { formula: ref, result: val }, { font: grand ? { ...BOLD, color: { argb: 'FFFFFFFF' } } : BOLD, fill: grand ? 'FF0F172A' : null, fmt: NUM, align: 'right', border: LIGHT_BOX });
    });
    // HSN-wise summary with SUMIFS on the item table
    const hs = hsnSummary(po);
    let h = r + 3;
    const hh = ['HSN', 'GST %', 'Taxable (₹)', ...(intra ? ['CGST (₹)', 'SGST (₹)'] : ['IGST (₹)']), 'Total tax (₹)'];
    hh.forEach((t, i) => cell(h, i + 1 + (i >= 1 ? 1 : 0), t, { font: { ...BOLD, size: 8, color: { argb: 'FF64748B' } }, fill: 'FFF1F5F9', border: LIGHT_BOX, align: i ? 'right' : 'left' }));
    merge(h, 1, h, 2) ;
    const rng = (c) => `$${colL(c)}$${first}:$${colL(c)}$${last}`;
    for (const x of hs.rows) {
        h++;
        merge(h, 1, h, 2); cell(h, 1, x.hsn, { border: LIGHT_BOX });
        cell(h, 3, x.gst, { fmt: '0.##"%"', align: 'right', border: LIGHT_BOX });
        const cond = `${rng(3)},$A${h},${rng(9)},$C${h}`;
        cell(h, 4, { formula: `SUMIFS(${rng(8)},${cond})`, result: x.taxable }, { fmt: NUM, align: 'right', border: LIGHT_BOX });
        if (intra) {
            cell(h, 5, { formula: `SUMIFS(${rng(10)},${cond})`, result: x.cgst }, { fmt: NUM, align: 'right', border: LIGHT_BOX });
            cell(h, 6, { formula: `SUMIFS(${rng(11)},${cond})`, result: x.sgst }, { fmt: NUM, align: 'right', border: LIGHT_BOX });
            cell(h, 7, { formula: `E${h}+F${h}`, result: x.cgst + x.sgst }, { fmt: NUM, align: 'right', border: LIGHT_BOX, font: BOLD });
        } else {
            cell(h, 5, { formula: `SUMIFS(${rng(10)},${cond})`, result: x.igst }, { fmt: NUM, align: 'right', border: LIGHT_BOX });
            cell(h, 6, { formula: `E${h}`, result: x.igst }, { fmt: NUM, align: 'right', border: LIGHT_BOX, font: BOLD });
        }
    }
    r = Math.max(h, r + totRows.length) + 2;

    // Terms
    const terms = termLines(po.terms);
    if (terms.length) {
        merge(r, 1, r, N); cell(r, 1, 'TERMS AND CONDITIONS', { font: BOLD }); r++;
        for (const t of terms) { merge(r, 1, r, N); cell(r, 1, t, { font: { ...FONT, size: 8.5 } }); ws.getRow(r).height = Math.ceil(t.length / 170) * 12 + 2; r++; }
        r++;
    }
    // Supplier acknowledgement | for <company>
    const half = Math.floor(N / 2);
    merge(r, 1, r, half); cell(r, 1, 'SUPPLIER ACKNOWLEDGEMENT', { font: BOLD, border: LIGHT_BOX });
    merge(r, half + 2, r, N); cell(r, half + 2, `For ${name}`, { font: BOLD, align: 'right', border: LIGHT_BOX });
    merge(r + 1, 1, r + 3, half); cell(r + 1, 1, 'We accept this purchase order and its terms.\n\n\nSignature & stamp                                        Date', { font: { ...FONT, color: { argb: 'FF64748B' } }, border: LIGHT_BOX });
    const ds = po.doc_settings || {};
    merge(r + 1, half + 2, r + 3, N);
    cell(r + 1, half + 2, `\n\n\n${ds.signatory_name ? `${ds.signatory_name}${ds.signatory_designation ? `, ${ds.signatory_designation}` : ''}\n` : ''}Authorised signatory`, { align: 'right', border: LIGHT_BOX });
    for (let i = 1; i <= 3; i++) ws.getRow(r + i).height = 18;

    ws.pageSetup.printTitlesRow = `${HEAD}:${HEAD}`;
    ws.views = [{ showGridLines: false, state: 'frozen', ySplit: HEAD, xSplit: 0, topLeftCell: `A${HEAD + 1}` }];

    // Second sheet: the line data for analysis
    const data = wb.addWorksheet('Lines data');
    const keys = ['PO no.', 'Supplier', 'Line', 'Item', 'HSN', 'Qty', 'Unit', 'Usage qty', 'Usage unit', 'Rate', 'Taxable', 'GST %', ...(intra ? ['CGST', 'SGST'] : ['IGST']), 'Amount', 'Delivery', 'Requisitions', 'Covers orders', 'Uncommitted', 'No requisition', 'Why'];
    data.addRow(keys).font = BOLD;
    for (const l of po.lines) {
        data.addRow([po.po_no, po.supplier_name, l.line_no, l.label, l.hsn_code || '', l.qty, l.purchase_uom, l.usage_qty, l.uom, l.rate, l.value, l.gst_pct,
            ...(intra ? [l.cgst, l.sgst] : [l.igst]), l.total, l.delivery_date || '', l.requisitions.map(x => `${x.pr_no} line ${x.pr_line_no} (${x.qty})`).join(', '),
            l.covers.map(c => `${c.order_no} ${c.qty}`).join(', '), l.uncommitted || '', l.extra_qty || '', l.extra_qty ? [l.extra_reason_label, l.extra_note].filter(Boolean).join(' — ') : '']);
    }
    data.columns.forEach((c, i) => { c.width = [16, 28, 6, 40][i] || 14; });
    data.views = [{ state: 'frozen', ySplit: 1 }];

    await saveWorkbook(wb, `${fileBase(po)}.xlsx`);
}

// PPM (pre-production meeting) sheet as an Excel file — the same form as the PDF template
// (ppmTemplatePdf.js): order facts filled in, every meeting box ruled and blank so it can be filled
// in Excel or printed (A4 portrait, one page wide). Columns: A group · B field · C value · D field · E value.
import { newWorkbook, saveWorkbook, put, FONT, BOLD } from '../components/xlsxSave';
import { LEFT, RIGHT, COMMENTS, QUALITY, PRODUCTION, dmy } from './ppmTemplatePdf';

const SMALL_BOLD = { ...BOLD, size: 8 };

export async function buildPpmWorkbook(order, line, company) {
    const wb = await newWorkbook();
    const ws = wb.addWorksheet('PPM', {
        pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 1, margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 } },
    });
    ws.columns = [{ width: 18 }, { width: 18 }, { width: 34 }, { width: 22 }, { width: 34 }];
    let r = 1;
    const name = company?.trade_name || company?.legal_name || '';
    const place = company?.city ? `, ${String(company.city).toUpperCase()}` : '';

    // Title
    put(ws, r, [1, 4], `${name.toUpperCase()}${place}` || 'PRE-PRODUCTION MEETING', { font: { ...BOLD, size: 13 }, align: 'center' });
    put(ws, r, [5, 5], 'DATE:', { font: BOLD });
    ws.getRow(r).height = 22; r++;
    put(ws, r, [1, 3], 'PRE-PRODUCTION MEETING', { font: { ...BOLD, size: 11 }, align: 'center' });
    put(ws, r, [4, 4], 'DOC No:', { font: BOLD });
    put(ws, r, [5, 5], '');
    ws.getRow(r).height = 20; r++;

    // Order facts (from 3.0) and the meeting's own (blank)
    const colours = (line.colours || []).filter(c => (line.qty || []).some(x => x.garment_colour_id === c.garment_colour_id && Number(x.qty) > 0)).map(c => c.name);
    const facts = [
        ['NAME OF BUYER', order.customer_name || '', 'ORDER QUANTITY', Number(line.total_qty || 0)],
        ['STYLE NO', `${line.style_code}${line.style_name && line.style_name !== line.style_code ? ` — ${line.style_name}` : ''}`, 'NAME OF LINE', ''],
        ['FIT', '', 'SAMPLE TYPE', ''],
        ['ORDER NUMBER', [order.buyer_po_no, order.order_no].filter(Boolean).join(' / '), 'DELIVERY DATE', dmy(line.ship_date)],
    ];
    for (const [l1, v1, l2, v2] of facts) {
        put(ws, r, [1, 1], l1, { font: SMALL_BOLD });
        put(ws, r, [2, 3], v1);
        put(ws, r, [4, 4], l2, { font: SMALL_BOLD });
        const c = put(ws, r, [5, 5], v2, { align: typeof v2 === 'number' ? 'right' : 'left' });
        if (typeof v2 === 'number') c.numFmt = '#,##0';
        ws.getRow(r).height = 17; r++;
    }
    put(ws, r, [1, 1], 'COLOURS', { font: SMALL_BOLD });
    put(ws, r, [2, 5], colours.join(', '));
    ws.getRow(r).height = 17; r++;

    // Details: grouped fields left, single fields right, values blank
    const leftRows = LEFT.flatMap(([group, fields]) => fields.map((f, k) => ({ group, first: k === 0, span: fields.length, field: f })));
    const n = Math.max(leftRows.length, RIGHT.length);
    for (let k = 0; k < n; k++) {
        const lr = leftRows[k];
        if (lr?.first) {
            if (lr.span > 1) ws.mergeCells(r, 1, r + lr.span - 1, 1);
            const g = ws.getCell(r, 1);
            g.value = lr.group; g.font = SMALL_BOLD; g.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
            for (let j = 0; j < lr.span; j++) ws.getCell(r + j, 1).border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
        }
        put(ws, r, [2, 2], lr ? lr.field.toUpperCase() : '', { font: SMALL_BOLD, align: 'center' });
        put(ws, r, [3, 3], '');
        put(ws, r, [4, 4], RIGHT[k] ? RIGHT[k].toUpperCase() : '', { font: SMALL_BOLD, align: 'center' });
        put(ws, r, [5, 5], '');
        ws.getRow(r).height = 18; r++;
    }

    // Comment boxes
    for (const c of COMMENTS) {
        put(ws, r, [1, 1], c.toUpperCase(), { font: SMALL_BOLD, align: 'center' });
        put(ws, r, [2, 5], '');
        ws.getRow(r).height = 30; r++;
    }

    // Sign-off
    r++;
    put(ws, r, [1, 3], 'QUALITY TEAM', { font: BOLD, align: 'center' });
    put(ws, r, [4, 5], 'PRODUCTION TEAM', { font: BOLD, align: 'center' });
    r++;
    QUALITY.forEach((q, k) => {
        put(ws, r, [1, 1], q.toUpperCase(), { font: SMALL_BOLD });
        put(ws, r, [2, 3], '');
        put(ws, r, [4, 4], PRODUCTION[k].toUpperCase(), { font: SMALL_BOLD });
        put(ws, r, [5, 5], '');
        ws.getRow(r).height = 22; r++;
    });
    r++;
    const note = ws.getCell(r, 1);
    note.value = `Printed ${new Date().toLocaleString('en-IN')} from 3.0 · ${order.order_no} line ${line.line_no}. Upload the signed sheet to the order (Documents).`;
    note.font = { ...FONT, size: 7, color: { argb: 'FF6B7280' } };
    ws.pageSetup.printArea = `A1:E${r}`;
    return wb;
}

export async function exportPpmTemplateXlsx(order, line, company) {
    const wb = await buildPpmWorkbook(order, line, company);
    await saveWorkbook(wb, `PPM-${order.order_no}-L${line.line_no}-${line.style_code}`.replace(/[^\w.-]+/g, '_') + '.xlsx');
}

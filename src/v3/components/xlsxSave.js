// Small ExcelJS helpers for 3.0 forms (PPM template, trim card): load the library only when a
// file is made, ruled cells, and save in the browser.
export async function newWorkbook() {
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Factory management 3.0';
    wb.created = new Date();
    return wb;
}

export const THIN = { style: 'thin', color: { argb: 'FF000000' } };
export const BOX = { top: THIN, left: THIN, bottom: THIN, right: THIN };
export const FONT = { name: 'Arial', size: 9 };
export const BOLD = { ...FONT, bold: true };

// Write a value into a (possibly merged) block, ruled all round. `cols` 1-based [from, to].
export function put(ws, row, [from, to], value, { font = FONT, align = 'left', fill = null, wrap = true } = {}) {
    if (to > from) ws.mergeCells(row, from, row, to);
    const cell = ws.getCell(row, from);
    cell.value = value ?? '';
    cell.font = font;
    cell.alignment = { vertical: 'middle', horizontal: align, wrapText: wrap };
    if (fill) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
    for (let c = from; c <= to; c++) ws.getCell(row, c).border = BOX;
    return cell;
}

export async function saveWorkbook(wb, fileName) {
    const buf = await wb.xlsx.writeBuffer();
    const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

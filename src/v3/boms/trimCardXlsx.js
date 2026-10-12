// Trim card as an Excel file — draws the same model as the preview and the PDF
// (trimCardLayout.buildCard), so the merchandiser's ticks apply. Ruled cells, A4 landscape,
// one page wide; the swatch row and empty bottom boxes are left blank to fill or staple.
import { newWorkbook, saveWorkbook, put, FONT, BOLD } from '../components/xlsxSave';

const RED = 'FFBE123C';

export async function buildTrimCardWorkbook(m) {
    const wb = await newWorkbook();
    const ws = wb.addWorksheet('Trim card', {
        pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 } },
    });
    const n = Math.max(1, m.colours.length);
    const last = 1 + n;                         // A = row names, B.. = one column per colour
    const all = [1, last];
    const rest = [2, last];
    ws.columns = [{ width: 26 }, ...m.colours.map(() => ({ width: Math.max(16, Math.min(28, 120 / n)) }))];
    let r = 1;

    // Title + company
    put(ws, r, [1, 1], m.title, { font: { ...BOLD, size: 14 } });
    if (m.company) {
        put(ws, r, rest, `${m.company.name}${m.company.sub ? `\n${m.company.sub}` : ''}`, { font: { ...BOLD, size: 12 }, align: 'center' });
        ws.getRow(r).height = m.company.sub ? 32 : 22;
    } else ws.getRow(r).height = 22;
    r++;

    // Header fields
    for (const [label, value] of m.header) {
        put(ws, r, [1, 1], label, { font: BOLD });
        put(ws, r, rest, value || '');
        ws.getRow(r).height = 17;
        r++;
    }
    r++;

    // Grid: colours across
    put(ws, r, [1, 1], 'Colour', { font: BOLD, fill: 'FFF1F5F9' });
    m.colours.forEach((c, k) => put(ws, r, [2 + k, 2 + k], c.name, { font: BOLD, align: 'center', fill: 'FFF1F5F9' }));
    r++;
    for (const row of m.grid) {
        put(ws, r, [1, 1], row.sub ? `${row.label}\n${row.sub}` : row.label, { font: BOLD });
        for (let k = 0; k < row.cells.length; k++) {
            const lines = row.cells[k];
            const bad = lines.some(t => t.startsWith('! '));
            put(ws, r, [2 + k, 2 + k], lines.join('\n'), { font: { ...(row.bold ? BOLD : FONT), ...(bad ? { color: { argb: RED } } : {}) } });
        }
        const tall = Math.max(1, ...row.cells.map(l => l.length), row.sub ? 2 : 1);
        ws.getRow(r).height = row.swatch ? 70 : Math.max(16, tall * 13);
        r++;
    }

    // Size-wise strips
    if (m.strips.length) {
        r++;
        for (const s of m.strips) {
            put(ws, r, [1, 1], s.label, { font: BOLD });
            put(ws, r, rest, s.lines.join('\n'));
            ws.getRow(r).height = Math.max(16, s.lines.length * 13);
            r++;
        }
    }

    // Bottom construction boxes: one row each, text across
    if (m.bottom.length) {
        r++;
        for (const b of m.bottom) {
            put(ws, r, [1, 1], b.label, { font: BOLD });
            put(ws, r, rest, b.text || '');
            ws.getRow(r).height = Math.max(36, (String(b.text || '').split('\n').length) * 13);
            r++;
        }
    }

    // Sign-off
    if (m.footer) {
        r++;
        put(ws, r, all, 'Prepared by: ______________    Checked by: ______________    Approved by: ______________', { font: BOLD });
        ws.getRow(r).height = 30;
        r++;
    }
    ws.pageSetup.printArea = `A1:${ws.getColumn(last).letter}${r}`;
    return wb;
}

export async function exportTrimCardXlsx(m) {
    await saveWorkbook(await buildTrimCardWorkbook(m), `${m.file}.xlsx`);
}

// Company letterhead for 3.0 BOM printouts (PDF and Excel): logo + company name + address line, from
// the shared company profile (Admin → Company profile: trade / legal name, address, primary logo).
// Loaded once per few minutes; every part is optional — no profile or no logo just prints less.
import { adminApi } from '../../api/adminApi';
import { IMAGE_BASE_URL } from '../../utils/api';

const assetUrl = (url) => (!url ? null : url.startsWith('http') ? url : `${IMAGE_BASE_URL.replace(/\/uploads$/, '')}${url}`);
export const logoUrlOf = (company) => assetUrl(company?.logo_url);

const blobToDataUrl = (blob) => new Promise(resolve => { const r = new FileReader(); r.onloadend = () => resolve(r.result); r.onerror = () => resolve(null); r.readAsDataURL(blob); });
const imageSize = (dataUrl) => new Promise(resolve => { const im = new Image(); im.onload = () => resolve({ w: im.naturalWidth, h: im.naturalHeight }); im.onerror = () => resolve(null); im.src = dataUrl; });
const toPng = (dataUrl) => new Promise(resolve => {
    const im = new Image();
    im.onload = () => { try { const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight; c.getContext('2d').drawImage(im, 0, 0); resolve(c.toDataURL('image/png')); } catch { resolve(null); } };
    im.onerror = () => resolve(null);
    im.src = dataUrl;
});

// { dataUrl, format: 'PNG' | 'JPEG', w, h } — WebP / others are re-encoded to PNG (jsPDF / Excel can't take them).
async function fetchLogo(url) {
    try {
        const res = await fetch(url);
        if (!res.ok) return null;
        const blob = await res.blob();
        const mime = (blob.type || '').toLowerCase();
        let dataUrl = await blobToDataUrl(blob);
        if (!dataUrl) return null;
        let format = mime.includes('jpeg') || mime.includes('jpg') ? 'JPEG' : mime.includes('png') ? 'PNG' : null;
        if (!format) { dataUrl = await toPng(dataUrl); format = 'PNG'; }
        if (!dataUrl) return null;
        const size = await imageSize(dataUrl);
        return size ? { dataUrl, format, ...size } : null;
    } catch {
        return null;
    }
}

// Any company-profile image (logo, brand logo, signature, seal) as { dataUrl, format, w, h }, or null.
export const loadImage = (url) => (url ? fetchLogo(assetUrl(url)) : Promise.resolve(null));

let cached = null;
let cachedAt = 0;
export async function loadLetterhead() {
    if (cached && Date.now() - cachedAt < 5 * 60 * 1000) return cached;
    let c = null;
    try { c = (await adminApi.getCompanyProfile()).data; } catch { /* no profile: plain printout */ }
    const name = c?.trade_name || c?.legal_name || '';
    const sub = [
        c?.trade_name && c?.legal_name && c.legal_name !== c.trade_name ? c.legal_name : null,
        [c?.address_line1, c?.address_line2, c?.city, c?.state, c?.pin_code].filter(Boolean).join(', '),
        c?.gstin ? `GSTIN ${c.gstin}` : null,
    ].filter(Boolean).join(' · ');
    // The uploaded logo; else the app's own logo (as 2.0's PO PDF does).
    const logo = (c?.logo_url ? await fetchLogo(assetUrl(c.logo_url)) : null) || await fetchLogo('/matrix_logo.png');
    cached = { name, sub, logo, company: c };
    cachedAt = Date.now();
    return cached;
}

// PDF: logo (14 mm high) at the left, name and address beside it; the document title (e.g.
// "STYLE BOM") on the right. Returns the y below it (mm).
export function drawPdfLetterhead(doc, lh, { x = 8, y = 6, title = '', titleColor = null, note = '' } = {}) {
    if (!lh || (!lh.name && !lh.logo)) return y;
    const right = doc.internal.pageSize.getWidth() - x;
    if (title) {
        doc.setFont(undefined, 'bold'); doc.setFontSize(16);
        if (titleColor) doc.setTextColor(...titleColor);
        doc.text(title, right, y + 7, { align: 'right' });
        doc.setTextColor(0); doc.setFont(undefined, 'normal');
        if (note) { doc.setFontSize(8); doc.setTextColor(90); doc.text(note, right, y + 11.5, { align: 'right' }); doc.setTextColor(0); }
    }
    const titleW = title ? Math.max(60, doc.getTextWidth(title) * 1.3 + 10) : 0;
    let tx = x;
    const H = 14;
    if (lh.logo) {
        const w = Math.min(45, (H * lh.logo.w) / lh.logo.h);
        const h = (w * lh.logo.h) / lh.logo.w;
        try { doc.addImage(lh.logo.dataUrl, lh.logo.format, x, y, w, h, undefined, 'FAST'); tx = x + w + 4; } catch { /* unreadable logo: name only */ }
    }
    if (lh.name) { doc.setFont(undefined, 'bold'); doc.setFontSize(13); doc.setTextColor(0); doc.text(lh.name, tx, y + 6); doc.setFont(undefined, 'normal'); }
    if (lh.sub) { doc.setFontSize(7.5); doc.setTextColor(90); doc.text(doc.splitTextToSize(lh.sub, right - tx - titleW)[0], tx, y + 10.5); doc.setTextColor(0); }
    return y + H + 2;
}

// Excel (ExcelJS): logo over the first rows at the left, company name and address beside it, the
// document title (e.g. "STYLE BOM") on the right. Returns the next free row (content starts there).
export function addXlsxLetterhead(wb, ws, lh, { lastCol = 8, logoCols = 2, title = '', titleColor = null } = {}) {
    if (!lh || (!lh.name && !lh.logo)) return 1;
    let first = 1;
    if (lh.logo) {
        try {
            const id = wb.addImage({ base64: lh.logo.dataUrl, extension: lh.logo.format === 'JPEG' ? 'jpeg' : 'png' });
            const h = 52;
            ws.addImage(id, { tl: { col: 0, row: 0 }, ext: { width: Math.min(170, (h * lh.logo.w) / lh.logo.h), height: h } });
            first = logoCols + 1;
        } catch { /* unreadable logo: name only */ }
    }
    // Title takes the last columns (up to 3), the company the columns between logo and title.
    const titleCols = title ? Math.min(3, Math.max(1, lastCol - first)) : 0;
    const titleFrom = lastCol - titleCols + 1;
    const nameTo = Math.max(first, titleFrom - 1);
    ws.getRow(1).height = 22; ws.getRow(2).height = 16; ws.getRow(3).height = 6;
    if (nameTo > first) { ws.mergeCells(1, first, 1, nameTo); ws.mergeCells(2, first, 2, nameTo); }
    const n = ws.getCell(1, first); n.value = lh.name || ''; n.font = { name: 'Arial', size: 14, bold: true }; n.alignment = { vertical: 'middle' };
    const s2 = ws.getCell(2, first); s2.value = lh.sub || ''; s2.font = { name: 'Arial', size: 8, color: { argb: 'FF6B7280' } }; s2.alignment = { vertical: 'middle' };
    if (title && titleFrom > nameTo) {
        if (lastCol > titleFrom) ws.mergeCells(1, titleFrom, 2, lastCol); else ws.mergeCells(1, titleFrom, 2, titleFrom);
        const t = ws.getCell(1, titleFrom); t.value = title;
        t.font = { name: 'Arial', size: 16, bold: true, ...(titleColor ? { color: { argb: titleColor } } : {}) };
        t.alignment = { vertical: 'middle', horizontal: 'right' };
    }
    return 4;
}

// SheetJS (older v1 Excel exports, no image support): company name and address rows, then the rows.
export function sheetWithLetterhead(XLSX, rows, lh, title = '') {
    if (!lh || !lh.name) return XLSX.utils.json_to_sheet(rows);
    const ws = XLSX.utils.aoa_to_sheet([[lh.name, '', '', '', '', title], [lh.sub || ''], []]);
    XLSX.utils.sheet_add_json(ws, rows, { origin: 'A4' });
    return ws;
}

// BOM text helpers for the View style BOM screen (input: the /boms/:id/trim-card result). The v1 PDF / Excel
// exports that lived here were removed on 16 Oct 2026 — layout v2 (bomV2.js) is the only BOM download now.

export const SOURCE_LABEL = { EXACT: 'Exact colour', TONE: 'By tone', ALL: 'All colours' };

const fmt = (n) => Number(n ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 3 });

export const consumptionText = (l) => (l.consumption_basis === 'PER_GARMENT'
    ? `${fmt(l.qty_per_garment)} ${l.uom}/garment`
    : `${l.sizes.map(s => `${s.size_name} ${fmt(s.qty)}`).join(', ')} ${l.uom}`)
    + (Number(l.wastage_pct) ? ` +${fmt(l.wastage_pct)}%` : '');

export const lineDetail = (l) => (l.kind === 'fabric'
    ? (l.parts.length ? `Parts: ${l.parts.join(', ')}` : '')
    : `Issued at ${l.issue_stage_name}`);

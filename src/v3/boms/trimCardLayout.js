// Trim card (factory format): colours across, one row per BOM line, short codes in the cells,
// a blank swatch row, size-wise lines as a strip below, construction boxes at the bottom and a
// sign-off row. The merchandiser ticks what the card shows; the choices are saved per BOM
// (GET/PUT /boms/:id/card-settings, copied to a new version). buildCard() turns the resolved BOM
// (/boms/:id/trim-card) + the choices into one model — the preview and the PDF both draw it,
// so what is on screen is what prints.

const fmt = (n) => Number(n ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 3 });

export const BOTTOM_BOXES = [
    { key: 'waistband', label: 'Waistband & pocketing' },
    { key: 'belt_canvas', label: 'Belt canvas' },
    { key: 'binding', label: 'Binding / roll-in tape' },
    { key: 'fusing', label: 'Fly / Fr / Bk pkt fusing' },
    { key: 'special', label: 'Special trims' },
    { key: 'hook_eye', label: 'Hook & eye' },
    { key: 'labels', label: 'Labels' },
];

// How a row prints. Fabric and trims have their own choices; SIZES (a strip under the grid)
// only for lines that change by size.
export const SHOW_AS = {
    fabric: [
        { key: 'SHADE', label: 'Shade' },
        { key: 'QUALITY', label: 'Quality no.' },
        { key: 'QUALITY_SHADE', label: 'Quality no. + shade' },
        { key: 'FULL', label: 'Mill · quality · shade' },
        { key: 'DTM', label: 'DTM' },
    ],
    trim: [
        { key: 'CODE', label: 'Code' },
        { key: 'ARTICLE', label: 'Code + description' },
        { key: 'FULL', label: 'Brand + code' },
        { key: 'DTM', label: 'DTM' },
    ],
};
export const SIZES_AS = { key: 'SIZES', label: 'Sizes across' };

export const variesBySize = (l) => l.consumption_basis === 'PER_SIZE' || l.size_rule === 'BY_SIZE';

// Stable key per line (survives a new BOM version, where line ids change): fabric role or
// trim type + placement, numbered when the same one appears twice.
export function lineKeys(lines) {
    const seen = new Map();
    return lines.map(l => {
        const base = l.kind === 'fabric' ? `F:${l.role}` : `T:${l.trim_type_id}:${(l.placement || '').trim().toLowerCase()}`;
        const n = (seen.get(base) || 0) + 1;
        seen.set(base, n);
        return [`${base}#${n}`, l];
    });
}

const byIssueStage = (trims) => trims.map((l, k) => ({ l, k }))
    .sort((a, b) => (a.l.issue_stage_sort ?? 9999) - (b.l.issue_stage_sort ?? 9999) || a.k - b.k).map(x => x.l);

// Short code of one resolved item, as chosen.
function itemText(l, g, as) {
    const i = g.info || {};
    if (l.kind === 'fabric') {
        const shade = i.shade_name || i.shade_code;
        if (as === 'QUALITY') return i.code || g.label;
        if (as === 'QUALITY_SHADE') return [i.code, shade].filter(Boolean).join(' · ') || g.label;
        if (as === 'FULL') return g.label;
        return shade || g.label;
    }
    if (as === 'ARTICLE') return g.article || g.label;
    if (as === 'FULL') return g.label;
    return i.code || g.label;
}

// One cell → lines of text. Problems come back as "! …" (printed red).
function cellText(l, cell, as, sizeName) {
    if (!cell) return [];
    const probs = cell.problems.map(p => `! ${p}`);
    if (!cell.groups.length) return probs;
    if (as === 'DTM') return ['DTM', ...probs];
    const rows = cell.groups.map(g => ({ sizes: g.size_ids ? g.size_ids.map(z => sizeName.get(z) || '?').join(', ') : null, text: itemText(l, g, as) }));
    // Same item for every size group → print it once.
    const same = rows.every(r => r.text === rows[0].text);
    const out = same ? [rows[0].text] : rows.map(r => (r.sizes ? `${r.sizes}: ${r.text}` : r.text));
    return [...out, ...probs];
}

// Text the bottom boxes start with, from the BOM's own lines (the merchandiser can change it).
function prefill(card, key) {
    const match = {
        hook_eye: /hook/i, labels: /label/i, belt_canvas: /belt|canvas/i, binding: /binding|tape/i, fusing: /fus/i,
    }[key];
    if (!match) {
        if (key === 'waistband') {
            const p = card.fabric.filter(l => l.role === 'POCKETING');
            return p.map(l => `${l.title}: ${[...new Set(card.colours.flatMap(c => (l.cells[c.id]?.groups || []).map(g => itemText(l, g, 'SHADE'))))].join(', ')}`).join('\n');
        }
        return '';
    }
    const claimed = key === 'fusing' ? /belt|canvas/i : null;   // belt fusing goes under belt canvas
    const lines = card.trims.filter(l => match.test(l.trim_type_name || '') && !(claimed && claimed.test(l.trim_type_name || '')));
    if (key === 'labels') return lines.map((l, k) => `${k + 1}) ${l.title}`).join('\n');
    return lines.map(l => `${l.title}: ${[...new Set(card.colours.flatMap(c => (l.cells[c.id]?.groups || []).map(g => itemText(l, g, 'CODE'))))].join(', ')}`).join('\n');
}

export function defaultSettings(card) {
    const fabric = lineKeys(card.fabric);
    const head = fabric.find(([, l]) => l.role === 'SHELL') || fabric[0];
    const trims = lineKeys(card.trims);
    const trimOrder = byIssueStage(trims.map(([k, l]) => ({ ...l, _key: k })));
    return {
        v: 1,
        title: 'TRIM CARD',
        header: { company: true, buyer: true, style: true, so: true, date: true, sizes: false },
        hidden_colours: [],
        fabric_header: true,
        header_fabric_key: head ? head[0] : null,
        swatch_row: true,
        consumption: false,
        rows: [
            ...fabric.filter(([k]) => !head || k !== head[0]).map(([key]) => ({ key, show: true, as: 'SHADE' })),
            ...trimOrder.map(l => ({ key: l._key, show: true, as: 'CODE' })),
        ],
        bottom: BOTTOM_BOXES.map(b => { const text = prefill(card, b.key); return { key: b.key, label: b.label, show: !!text, text }; }),
        footer: true,
    };
}

// Saved choices against today's BOM: lines added since get defaults (at the end), lines removed
// are dropped, built-in bottom boxes always exist.
export function normalizeSettings(card, saved) {
    const def = defaultSettings(card);
    if (!saved || saved.v !== 1) return def;
    const all = new Map([...lineKeys(card.fabric), ...lineKeys(card.trims)]);
    const defRows = new Map(def.rows.map(r => [r.key, r]));
    const rows = (saved.rows || []).filter(r => all.has(r.key) && r.key !== saved.header_fabric_key);
    const have = new Set(rows.map(r => r.key));
    for (const r of def.rows) if (!have.has(r.key) && r.key !== saved.header_fabric_key) rows.push(r);
    // The fabric that was the header but is now a row (header fabric changed) stays listed.
    if (saved.header_fabric_key !== def.header_fabric_key && def.header_fabric_key && !rows.some(r => r.key === def.header_fabric_key) && all.has(def.header_fabric_key)) {
        rows.unshift({ key: def.header_fabric_key, show: true, as: 'SHADE' });
    }
    const savedBottom = saved.bottom || [];
    const bottom = [
        ...BOTTOM_BOXES.map(b => savedBottom.find(x => x.key === b.key) || def.bottom.find(x => x.key === b.key)),
        ...savedBottom.filter(x => !BOTTOM_BOXES.some(b => b.key === x.key)),
    ];
    return {
        ...def, ...saved,
        header: { ...def.header, ...(saved.header || {}) },
        header_fabric_key: all.has(saved.header_fabric_key) ? saved.header_fabric_key : def.header_fabric_key,
        rows: rows.map(r => ({ ...defRows.get(r.key), ...r })),
        bottom,
        hidden_colours: (saved.hidden_colours || []).filter(id => card.colours.some(c => c.id === id)),
    };
}

const dmy = (d) => d.toLocaleDateString('en-GB');

// The card as plain data: { title, company, header, colours, grid, strips, bottom, footer }.
export function buildCard(card, s, { order = null, company = null } = {}) {
    const sizeName = new Map(card.sizes.map(z => [z.id, z.name]));
    const lines = new Map([...lineKeys(card.fabric), ...lineKeys(card.trims)]);
    const colours = card.colours.filter(c => !s.hidden_colours.includes(c.id));

    const header = [];
    if (s.header.buyer) header.push(['Buyer', order?.customer_name || card.bom.buyer || '']);
    if (s.header.style) header.push(['Style', card.bom.style_name && card.bom.style_name !== card.bom.style_code ? `${card.bom.style_code} — ${card.bom.style_name}` : card.bom.style_code]);
    if (s.header.so) header.push(['S.O. no.', order ? `${order.order_no}${order.buyer_po_no ? ` · PO ${order.buyer_po_no}` : ''}` : '']);
    if (s.header.date) header.push(['Date', dmy(new Date())]);
    if (s.header.sizes) header.push(['Sizes', card.sizes.map(z => z.name).join(', ')]);
    header.push(['Style BOM', `v${card.bom.version_no} · ${String(card.bom.status).replace('_', ' ').toLowerCase()}`]);

    const grid = [];
    const head = s.fabric_header && s.header_fabric_key ? lines.get(s.header_fabric_key) : null;
    // Column headings are the garment colours; the header fabric's quality no. and shade follow.
    if (head) {
        grid.push({ label: 'Fab. Q. No.', bold: true, cells: colours.map(c => cellText(head, head.cells[c.id], 'QUALITY', sizeName)) });
        grid.push({ label: 'Shade', bold: true, cells: colours.map(c => cellText(head, head.cells[c.id], 'SHADE', sizeName)) });
    }
    if (s.swatch_row) grid.push({ label: 'Swatch', swatch: true, cells: colours.map(() => []) });

    const strips = [];
    for (const r of s.rows) {
        if (!r.show) continue;
        const l = lines.get(r.key);
        if (!l) continue;
        const label = l.kind === 'fabric' ? l.title : l.title.toUpperCase();
        const sub = s.consumption
            ? `${l.consumption_basis === 'PER_GARMENT' ? `${fmt(l.qty_per_garment)} ${l.uom}/gmt` : `${l.uom} by size`}${Number(l.wastage_pct) ? ` +${fmt(l.wastage_pct)}%` : ''}`
            : null;
        if (r.as === 'SIZES' && variesBySize(l)) {
            const out = [];
            if (l.consumption_basis === 'PER_SIZE') out.push(`${l.sizes.map(z => `${z.size_name} = ${fmt(z.qty)}`).join('   ')}   (${l.uom})`);
            if (l.size_rule === 'BY_SIZE') {
                const per = colours.map(c => ({ c, t: (l.cells[c.id]?.groups || []).map(g => `${g.size_ids.map(z => sizeName.get(z) || '?').join(', ')} = ${itemText(l, g, 'CODE')}`).join('   ') }));
                if (per.every(p => p.t === per[0].t)) out.push(per[0].t);
                else per.forEach(p => out.push(`${p.c.name}: ${p.t}`));
            }
            strips.push({ label, lines: out.filter(Boolean) });
            continue;
        }
        grid.push({ label, sub, cells: colours.map(c => cellText(l, l.cells[c.id], r.as, sizeName)) });
    }

    const bottom = s.bottom.filter(b => b.show).map(b => ({ label: b.label, text: b.text || '' }));
    const name = company?.trade_name || company?.legal_name || '';
    // Same line as the letterhead on the PDF / Excel: legal name (when different), address, GSTIN.
    const sub = [
        company?.trade_name && company?.legal_name && company.legal_name !== company.trade_name ? company.legal_name : null,
        [company?.address_line1, company?.address_line2, company?.city, company?.state, company?.pin_code].filter(Boolean).join(', '),
        company?.gstin ? `GSTIN ${company.gstin}` : null,
    ].filter(Boolean).join(' · ');
    return {
        title: s.title || 'TRIM CARD',
        company: s.header.company && name ? { name, sub } : null,
        header, colours, grid, strips, bottom, footer: s.footer,
        file: `Trim-card-${card.bom.style_code}-v${card.bom.version_no}${order ? `-${order.order_no}` : ''}`.replace(/[^\w.-]+/g, '_'),
    };
}

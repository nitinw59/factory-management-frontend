// Shared helpers for BOM line colour / size rules (mirrors the server rules).

export const FABRIC_ROLES = [
    { key: 'SHELL', label: 'Shell' }, { key: 'POCKETING', label: 'Pocketing' }, { key: 'LINING', label: 'Lining' },
    { key: 'CONTRAST', label: 'Contrast' }, { key: 'OTHER', label: 'Other' },
];
export const COLOUR_RULES = [
    { key: 'ALL', label: 'Same for all colours', hint: 'One item for every garment colour.' },
    { key: 'BY_TONE', label: 'By tone (dark / light)', hint: 'One item per tone; exact-colour exceptions allowed.' },
    { key: 'BY_COLOUR', label: 'By colour', hint: 'One item per garment colour.' },
];
export const roleLabel = (k) => FABRIC_ROLES.find(r => r.key === k)?.label || k;
export const ruleLabel = (k) => COLOUR_RULES.find(r => r.key === k)?.label || k;

// The colour's tone on this BOM: its BOM override, else its default tone.
export const effectiveToneId = (c) => String(c.override_tone_id || c.default_tone_id || '');

// The colour keys a line needs picks for, given its rule, the BOM colours and tones.
export function colourKeys(rule, bomColours, tones) {
    if (rule === 'ALL') return [{ match: 'ALL', key: 'ALL', label: 'All colours' }];
    if (rule === 'BY_COLOUR') {
        return bomColours.map(c => ({ match: 'COLOUR', key: `COLOUR:${c.garment_colour_id}`, garment_colour_id: String(c.garment_colour_id), label: c.name }));
    }
    // BY_TONE: every tone used by a BOM colour (plus any active tone), labelled with its colours
    return tones.map(t => {
        const members = bomColours.filter(c => effectiveToneId(c) === String(t.id)).map(c => c.name);
        return { match: 'TONE', key: `TONE:${t.id}`, tone_group_id: String(t.id), label: t.name, members };
    });
}

export const itemKey = (it) => (it.match === 'ALL' ? 'ALL' : it.match === 'TONE' ? `TONE:${it.tone_group_id}` : `COLOUR:${it.garment_colour_id}`);

// Which BOM colours × style sizes have no item on a line (empty array = complete).
export function lineGaps(line, bomColours, styleSizeIds) {
    const items = line.items || [];
    const sizeRule = line.size_rule || 'ALL';
    const gaps = [];
    for (const c of bomColours) {
        const cid = String(c.garment_colour_id);
        // exact colour, else tone, else all
        let rows = items.filter(i => i.match === 'COLOUR' && String(i.garment_colour_id) === cid);
        if (!rows.length && line.colour_rule === 'BY_TONE') rows = items.filter(i => i.match === 'TONE' && String(i.tone_group_id) === effectiveToneId(c));
        if (!rows.length) rows = items.filter(i => i.match === 'ALL');
        if (!rows.length) { gaps.push(c.name); continue; }
        if (sizeRule === 'BY_SIZE') {
            const covered = new Set(rows.flatMap(r => (r.size_ids || []).map(String)));
            const missing = styleSizeIds.filter(s => !covered.has(String(s)));
            if (missing.length) gaps.push(`${c.name} (${missing.length} size${missing.length !== 1 ? 's' : ''})`);
        }
    }
    return gaps;
}

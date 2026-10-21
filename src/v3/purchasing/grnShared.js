export const GRN_STATUS = {
    PENDING_APPROVAL: { label: 'Waiting for approval', cls: 'bg-amber-50 text-amber-800 border-amber-300' },
    APPROVED:         { label: 'In stock',             cls: 'bg-emerald-50 text-emerald-700 border-emerald-300' },
    REJECTED:         { label: 'Rejected',             cls: 'bg-rose-50 text-rose-700 border-rose-300' },
    REVERSED:         { label: 'Reversed',             cls: 'bg-slate-50 text-slate-500 border-slate-300 line-through' },
    WITHDRAWN:        { label: 'Withdrawn',            cls: 'bg-slate-50 text-slate-500 border-slate-300' },
};

// ── Receive drafts in this browser (20 Oct 2026): localStorage `v3.grnDraft.<user>.<po>` =
// { savedAt, poNo, header, vals, fromGrn? } — written by the receive screen on every change, and from a withdrawn GRN
// so its entries can be corrected and sent again. Browser storage only (never the server, never another device).
const DRAFT_PREFIX = 'v3.grnDraft.';
const DRAFT_DAYS = 30;
const draftKey = (userId, poId) => `${DRAFT_PREFIX}${userId || 'anon'}.${poId}`;
export const readDraft = (userId, poId) => {
    try {
        const d = JSON.parse(localStorage.getItem(draftKey(userId, poId)) || 'null');
        if (!d || Date.now() - d.savedAt > DRAFT_DAYS * 86400000) return null;
        return d;
    } catch { return null; }
};
export const writeDraft = (userId, poId, d) => { try { localStorage.setItem(draftKey(userId, poId), JSON.stringify(d)); return true; } catch { return false; } };
export const dropDraft = (userId, poId) => { try { localStorage.removeItem(draftKey(userId, poId)); } catch { /* storage blocked */ } };
// PO ids with a live draft for this user; expired drafts are removed on the way.
export const draftPoIds = (userId) => {
    const out = new Set();
    try {
        const prefix = `${DRAFT_PREFIX}${userId || 'anon'}.`;
        for (let i = localStorage.length - 1; i >= 0; i -= 1) {
            const k = localStorage.key(i);
            if (!k || !k.startsWith(prefix)) continue;
            const poId = k.slice(prefix.length);
            if (readDraft(userId, poId)) out.add(poId); else localStorage.removeItem(k);
        }
    } catch { /* storage blocked */ }
    return out;
};

// A GRN's entries as a receive draft (header + one ticked line per GRN line, fabric rolls included) — used when a
// receipt waiting for approval is withdrawn to correct it. Fabric labels are stored "ARTICLE / SHADE".
export const grnToDraft = (g) => {
    const vals = {};
    for (const l of g.lines) {
        const base = { on: true, rejected_qty: l.rejected_qty ? String(l.rejected_qty) : '', rejection_reason: l.rejection_reason || '' };
        if (l.kind === 'FABRIC') {
            const code = String(l.label_code || ''); const cut = code.lastIndexOf(' / ');
            vals[l.po_line_id] = { ...base, label_article: cut >= 0 ? code.slice(0, cut) : code, label_shade: cut >= 0 ? code.slice(cut + 3) : '',
                rolls: (l.rolls || []).map(r => ({ roll_no: r.roll_no || '', dye_lot: r.dye_lot || '', qty: r.qty != null ? String(r.qty) : '', width: r.width != null ? String(r.width) : '', location: r.location || '' })) };
        } else {
            vals[l.po_line_id] = { ...base, label_code: l.label_code || '', accepted_qty: l.accepted_qty != null ? String(l.accepted_qty) : '' };
        }
    }
    return {
        savedAt: Date.now(), poNo: g.po_no, fromGrn: g.grn_no, vals,
        header: { challan_no: g.challan_no || '', challan_date: g.challan_date || '', vehicle_no: g.vehicle_no || '', received_date: g.received_date || '', notes: g.notes || '' },
    };
};

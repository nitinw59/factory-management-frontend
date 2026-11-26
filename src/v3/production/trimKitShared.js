// Trim orders and kits (26 Nov 2026, migration 90): a trim order (TO3/…) per cut batch, made when the batch is finalised;
// the trim store prepares it in kits (TK3/…/####-n) — any number, several ready at once; a line loader signs each kit.
export const ORDER_STATUS = {
    OPEN: { label: 'To prepare', cls: 'bg-slate-100 text-slate-700 border-slate-300' },
    PARTLY_ISSUED: { label: 'Handed in part', cls: 'bg-amber-50 text-amber-800 border-amber-300' },
    ISSUED: { label: 'Handed over', cls: 'bg-indigo-50 text-indigo-700 border-indigo-300' },
    CLOSED: { label: 'Closed', cls: 'bg-slate-50 text-slate-500 border-slate-300' },
    CANCELLED: { label: 'Cancelled', cls: 'bg-slate-50 text-slate-400 border-slate-200 line-through' },
};
export const KIT_STATE = {
    PREPARING: { label: 'Being prepared', cls: 'bg-slate-100 text-slate-700 border-slate-300' },
    READY: { label: 'Ready for pickup', cls: 'bg-emerald-50 text-emerald-800 border-emerald-300' },
    SIGNED: { label: 'Signed — handed over', cls: 'bg-indigo-50 text-indigo-700 border-indigo-300' },
    CANCELLED: { label: 'Cancelled', cls: 'bg-slate-50 text-slate-400 border-slate-200 line-through' },
};
export const KIT_STATUS = { ...KIT_STATE, ...ORDER_STATUS };   // either (a row's own field says which)
export const ACTION = { CREATED: 'Created', EDITED: 'Changed', KIT_MADE: 'Kit made', KIT_EDITED: 'Kit changed', KIT_CANCELLED: 'Kit cancelled', READY: 'Kit ready for pickup', UNREADY: 'Kit pulled back', SENT_BACK: 'Kit sent back by the line', SIGNED: 'Kit signed for', CLOSED: 'Closed', CANCELLED: 'Cancelled',
    OVER_CUT: 'Over-cut', PICKED: 'Picked (nothing went in)', COUNTED: 'Counted', LINE_BACK: 'Back to the store', EXTRA_REQUESTED: 'Extra line asked', EXTRA_APPROVED: 'Extra line approved', EXTRA_REFUSED: 'Extra line refused',
    REMADE: 'Remade from the order\'s BOM', BOM_CHANGED: 'Order BOM changed', BOM_CHANGE_SEEN: 'BOM change dealt with', RETURN_CONFIRMED: 'Rejected trims confirmed' };   // 25 Oct 2026 (kits follow the BOM)
// Picking (21 Oct 2026): why less than owed went in the kit; the loader's count.
export const SHORT_REASON = { NOT_IN_STOCK: 'Not in stock', DAMAGED: 'Damaged', COUNT_SHORT: 'Count short (shelf has less)', OTHER: 'Other' };
export const COUNT_ISSUE = { OK: 'As picked', SHORT: 'Short', EXCESS: 'Excess', WRONG_ITEM: 'Wrong item', DAMAGED: 'Damaged', OTHER: 'Rejected' };
// What the line loader rejects from a kit goes back to the store (26 Nov 2026, migration 92).
export const REJECT_REASON = { WRONG_ITEM: 'Wrong item', DAMAGED: 'Damaged', SHORT: 'Short — not in the bag', OTHER: 'Other' };
export const RETURN_STATE = {
    PENDING: { label: 'Coming back — to confirm', cls: 'bg-rose-50 text-rose-800 border-rose-300' },
    RECEIVED: { label: 'Back on the shelf', cls: 'bg-emerald-50 text-emerald-800 border-emerald-300' },
    WRITTEN_OFF: { label: 'Written off', cls: 'bg-slate-100 text-slate-600 border-slate-300' },
};
export const qty = (n, uom) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: uom === 'pcs' ? 0 : 3 });
// "3 cones = 15,000 m" for threads, "300 pcs" otherwise.
export const handout = (l, q = l.qty) => (l.in_units ? `${Math.round((q / l.factor) * 1000) / 1000} ${l.purchase_uom} = ${qty(q, l.uom)} ${l.uom}` : `${qty(q, l.uom)} ${l.uom}`);

// One row per item (27 Oct 2026, owner: "add everything whatever is CUT in batch trim kit, make separate column for over
// cut quantity requirement and total quantity"): an item's ORDER / OVER_FREE / OVER_APPROVAL lines shown together —
// order, over-cut, total. The lines stay apart underneath (order from the allocation, over-cut from free stock — the
// issue slip, bill and reconciliation keep them apart); picking and counting spread one number over them, order first.
// Extra lines stay rows of their own.
const PART_RANK = { ORDER: 0, OVER_FREE: 1, OVER_APPROVAL: 2 };
const r3 = (n) => Math.round(Number(n) * 1000) / 1000;
export const isOver = (l) => l.part === 'OVER_FREE' || l.part === 'OVER_APPROVAL';
export const unitsOwedOf = (l) => Math.ceil(l.remaining / l.factor - 1e-9);
// The order a kit's items are shown and printed in (23 Nov 2026, owner: "trim kit pdf and put in the kit must match items
// sequence"): trim type A–Z, then kit line no. Used by the pick list PDF and every list on the kit page.
// 26 Nov 2026 (owner: "let user decide what item to skip on kit, example we have stages with each item line"): the kit is
// read stage by stage — the issue stage of each item's Order BOM line, in route order — then trim type, then line no.
// The kit page, the pick list and Put in the kit all use this order. Items with no stage come last.
export const stageKey = (g) => g.issue_stage?.id || 'none';
export const stageName = (g) => g.issue_stage?.name || 'No stage';
export const byStage = (groups) => [...groups].sort((a, b) => (a.issue_stage?.sort ?? 9999) - (b.issue_stage?.sort ?? 9999)
    || String(a.type_name || '~').localeCompare(String(b.type_name || '~')) || a.line_no - b.line_no);
export const byTrimType = (groups) => [...groups].sort((a, b) => String(a.type_name || '~').localeCompare(String(b.type_name || '~')) || a.line_no - b.line_no);

// What can go in a kit now (26 Nov 2026, half kits — owner: "never include 0 items"; since the trim orders and kits build the
// server works it out, net of every open kit — controllers/v3/trimKitsController.js capsOf): per line can_now (and whole
// units for threads), order part first — the shelf less open kits of any order; an order line: the order's reservation
// less its open kits (threads up to one cone over, if free stock covers the top-up); an over-cut or extra line: free
// stock less the free-stock lines in open kits. Returns each line's quantity, the row total, and why the rest waits:
// 'stock' (not in store) · 'res' (not reserved) · 'free' (no free stock for the over-cut) · null (all of it can go in).
export const freeStockLine = (l) => l.part !== 'ORDER';
export function pickCaps(g) {
    const caps = g.lines.map(l => ({ qty: Number(l.can_now || 0), units: l.in_units ? Number(l.can_units || 0) : null }));
    const total = g.in_units ? caps.reduce((a, c) => a + (c.units || 0), 0) : r3(caps.reduce((a, c) => a + c.qty, 0));
    const cause = (g.lines.find(l => l.wait_why && Number(l.to_kit || 0) > Number(l.can_now || 0) + 1e-9) || {}).wait_why || null;
    return { caps, total, cause,
        orderQty: r3(g.lines.reduce((a, l, i) => a + (freeStockLine(l) ? 0 : caps[i].qty), 0)), overQty: r3(g.lines.reduce((a, l, i) => a + (freeStockLine(l) ? caps[i].qty : 0), 0)) };
}
export const WAIT_CAUSE = { stock: 'not in store', res: 'not reserved for the order', free: 'no free stock for the over-cut' };

export function groupKitLines(lines) {
    const groups = new Map();
    for (const l of lines) {
        const key = l.part === 'EXTRA' ? `x:${l.id}` : `i:${l.item_id}`;
        if (!groups.has(key)) groups.set(key, { key, extra: l.part === 'EXTRA', lines: [] });
        groups.get(key).lines.push(l);
    }
    return [...groups.values()].map(g => {
        const ls = g.lines.sort((a, b) => (PART_RANK[a.part] ?? 9) - (PART_RANK[b.part] ?? 9) || a.line_no - b.line_no);
        const f = ls[0];
        const sum = (list, fn) => r3(list.reduce((a, l) => a + (Number(fn(l)) || 0), 0));
        const over = ls.filter(isOver);
        const order = ls.filter(l => !isOver(l));
        return {
            ...g, lines: ls, line_no: f.line_no, item_id: f.item_id, label: f.label, type_name: f.type_name, uom: f.uom, purchase_uom: f.purchase_uom,
            factor: f.factor, in_units: f.in_units, stock_on_hand: f.stock_on_hand, stock_free: f.stock_free, on_order: f.on_order, order_allocated: f.order_allocated, issue_stage: f.issue_stage || null,
            order_qty: sum(order, l => l.qty), over_qty: sum(over, l => l.qty), qty: sum(ls, l => l.qty),
            over_free_qty: sum(ls.filter(l => l.part === 'OVER_FREE'), l => l.qty), over_limit_qty: sum(ls.filter(l => l.part === 'OVER_APPROVAL'), l => l.qty),
            issued: sum(ls, l => l.issued), closed: sum(ls, l => l.closed), remaining: sum(ls, l => l.remaining), picked: sum(ls, l => l.picked),
            picked_units: ls.reduce((a, l) => a + (l.picked_units || 0), 0), units_owed: ls.reduce((a, l) => a + (l.in_units && l.remaining > 0 ? unitsOwedOf(l) : 0), 0),
            in_kits: sum(ls, l => l.in_kits), to_kit: sum(ls, l => l.to_kit), units_to_kit: ls.reduce((a, l) => a + (l.in_units && l.to_kit > 0 ? Math.ceil(r3(l.to_kit / l.factor) - 1e-9) : 0), 0),
            over_remaining: sum(over, l => l.remaining),
        };
    }).sort((a, b) => a.line_no - b.line_no);
}
// Spread a whole-row amount over the row's lines in order (order part first): caps[i] is what line i can take; whatever
// is left over goes on the last line (an excess at counting).
export function spread(total, caps) {
    let left = Number(total) || 0;
    return caps.map((cap, i) => {
        const take = i === caps.length - 1 ? left : Math.min(left, cap);
        left = r3(left - take);
        return r3(take);
    });
}

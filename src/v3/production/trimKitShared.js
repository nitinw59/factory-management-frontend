// Trim kit labels shared by the kit list and kit page.
export const KIT_STATUS = {
    DRAFT: { label: 'Being prepared', cls: 'bg-slate-100 text-slate-700 border-slate-300' },
    READY: { label: 'Ready for pickup', cls: 'bg-emerald-50 text-emerald-800 border-emerald-300' },
    PARTLY_ISSUED: { label: 'Part handed over', cls: 'bg-amber-50 text-amber-800 border-amber-300' },
    ISSUED: { label: 'Handed over', cls: 'bg-indigo-50 text-indigo-700 border-indigo-300' },
    CLOSED: { label: 'Closed', cls: 'bg-slate-50 text-slate-500 border-slate-300' },
    CANCELLED: { label: 'Cancelled', cls: 'bg-slate-50 text-slate-400 border-slate-200 line-through' },
};
export const ACTION = { CREATED: 'Created', EDITED: 'Changed', READY: 'Put in the kit — ready', UNREADY: 'Pulled back', SENT_BACK: 'Sent back by the line', SIGNED: 'Signed for', CLOSED: 'Closed', CANCELLED: 'Cancelled',
    OVER_CUT: 'Over-cut', PICKED: 'Picked (nothing went in)', COUNTED: 'Counted', LINE_BACK: 'Back to the store', EXTRA_REQUESTED: 'Extra line asked', EXTRA_APPROVED: 'Extra line approved', EXTRA_REFUSED: 'Extra line refused',
    REMADE: 'Remade from the order\'s BOM', BOM_CHANGED: 'Order BOM changed', BOM_CHANGE_SEEN: 'BOM change dealt with' };   // 25 Oct 2026 (kits follow the BOM)
// Picking (21 Oct 2026): why less than owed went in the kit; the loader's count.
export const SHORT_REASON = { NOT_IN_STOCK: 'Not in stock', DAMAGED: 'Damaged', COUNT_SHORT: 'Count short (shelf has less)', OTHER: 'Other' };
export const COUNT_ISSUE = { OK: 'As picked', SHORT: 'Short', EXCESS: 'Excess', WRONG_ITEM: 'Wrong item', DAMAGED: 'Damaged' };
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
            factor: f.factor, in_units: f.in_units, stock_on_hand: f.stock_on_hand, stock_free: f.stock_free, on_order: f.on_order,
            order_qty: sum(order, l => l.qty), over_qty: sum(over, l => l.qty), qty: sum(ls, l => l.qty),
            over_free_qty: sum(ls.filter(l => l.part === 'OVER_FREE'), l => l.qty), over_limit_qty: sum(ls.filter(l => l.part === 'OVER_APPROVAL'), l => l.qty),
            issued: sum(ls, l => l.issued), closed: sum(ls, l => l.closed), remaining: sum(ls, l => l.remaining), picked: sum(ls, l => l.picked),
            picked_units: ls.reduce((a, l) => a + (l.picked_units || 0), 0), units_owed: ls.reduce((a, l) => a + (l.in_units && l.remaining > 0 ? unitsOwedOf(l) : 0), 0),
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

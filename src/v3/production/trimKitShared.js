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
    OVER_CUT: 'Over-cut', PICKED: 'Picked (nothing went in)', COUNTED: 'Counted', LINE_BACK: 'Back to the store', EXTRA_REQUESTED: 'Extra line asked', EXTRA_APPROVED: 'Extra line approved', EXTRA_REFUSED: 'Extra line refused' };
// Picking (21 Oct 2026): why less than owed went in the kit; the loader's count.
export const SHORT_REASON = { NOT_IN_STOCK: 'Not in stock', DAMAGED: 'Damaged', COUNT_SHORT: 'Count short (shelf has less)', OTHER: 'Other' };
export const COUNT_ISSUE = { OK: 'As picked', SHORT: 'Short', EXCESS: 'Excess', WRONG_ITEM: 'Wrong item', DAMAGED: 'Damaged' };
export const qty = (n, uom) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: uom === 'pcs' ? 0 : 3 });
// "3 cones = 15,000 m" for threads, "300 pcs" otherwise.
export const handout = (l, q = l.qty) => (l.in_units ? `${Math.round((q / l.factor) * 1000) / 1000} ${l.purchase_uom} = ${qty(q, l.uom)} ${l.uom}` : `${qty(q, l.uom)} ${l.uom}`);

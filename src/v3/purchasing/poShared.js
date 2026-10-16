// Purchase order labels, money formatting and amount in words (Indian system).

export const PO_STATUS = {
    DRAFT:           { label: 'Draft',           cls: 'bg-slate-100 text-slate-700 border-slate-300' },
    PENDING_APPROVAL: { label: 'Waiting for approval', cls: 'bg-rose-50 text-rose-700 border-rose-300' },
    ISSUED:          { label: 'Issued',          cls: 'bg-indigo-50 text-indigo-700 border-indigo-300' },
    PARTLY_RECEIVED: { label: 'Partly received', cls: 'bg-amber-50 text-amber-800 border-amber-300' },
    RECEIVED:        { label: 'Received',        cls: 'bg-emerald-50 text-emerald-700 border-emerald-300' },
    SHORT_CLOSED:    { label: 'Short-closed',    cls: 'bg-slate-50 text-slate-500 border-slate-300' },
    CANCELLED:       { label: 'Cancelled',       cls: 'bg-slate-50 text-slate-400 border-slate-200 line-through' },
};

// Why a line holds quantity with no requisition (server: EXTRA_REASONS in purchaseOrdersController.js).
export const EXTRA_REASONS = [
    ['ADVANCE', 'Advance buy for an expected order'], ['MOQ', 'Supplier minimum / pack size'], ['PRICE', 'Price advantage / bulk rate'],
    ['SAMPLE', 'Sample / trial'], ['STOCK', 'Store stock (spares / general use)'], ['OTHER', 'Other'],
];

export const inr = (n) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// 1,23,45,678.50 → "Rupees One Crore Twenty-Three Lakh Forty-Five Thousand Six Hundred Seventy-Eight and Fifty Paise Only"
const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
const two = (n) => (n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? `-${ONES[n % 10]}` : ''}`);
const three = (n) => [Math.floor(n / 100) ? `${ONES[Math.floor(n / 100)]} Hundred` : '', n % 100 ? two(n % 100) : ''].filter(Boolean).join(' ');
export function amountInWords(amount) {
    const rupees = Math.floor(Math.round(Number(amount || 0) * 100) / 100);
    const paise = Math.round((Number(amount || 0) - rupees) * 100);
    const parts = [];
    let n = rupees;
    const crore = Math.floor(n / 10000000); n %= 10000000;
    const lakh = Math.floor(n / 100000); n %= 100000;
    const thousand = Math.floor(n / 1000); n %= 1000;
    if (crore) parts.push(`${crore >= 100 ? three(crore) : two(crore)} Crore`);
    if (lakh) parts.push(`${two(lakh)} Lakh`);
    if (thousand) parts.push(`${two(thousand)} Thousand`);
    if (n) parts.push(three(n));
    const words = parts.join(' ') || 'Zero';
    return `Rupees ${words}${paise ? ` and ${two(paise)} Paise` : ''} Only`;
}

// The PO PDF / Excel live in poPrint.js (A4 landscape layout, 16 Oct 2026).

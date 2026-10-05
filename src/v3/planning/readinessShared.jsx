// Readiness labels shared by the dashboard and the order requirements page.
export const READY_STATUS = {
    READY:     { label: 'Ready',      hint: 'Every item allocated from stock in hand.' },
    IN_STOCK:  { label: 'In stock — allocate', hint: 'Free stock covers the rest; allocate it to this order.' },
    ON_ORDER:  { label: 'On order',   hint: 'The rest is on approved requisitions (incl. surplus already ordered for other orders).' },
    REQUESTED: { label: 'Requested',  hint: 'The rest is on requisitions not yet approved.' },
    SHORT:     { label: 'Short',      hint: 'Something is still to raise (on the buy list).' },
    NO_REQUIREMENTS: { label: 'No requirements', hint: 'Nothing calculated for this order.' },
};
export const RAG_CLS = {
    GREEN: 'bg-emerald-50 text-emerald-700 border-emerald-300',
    AMBER: 'bg-amber-50 text-amber-800 border-amber-300',
    RED:   'bg-rose-50 text-rose-700 border-rose-300',
};
export const RAG_DOT = { GREEN: 'bg-emerald-500', AMBER: 'bg-amber-400', RED: 'bg-rose-500' };

export function ReadinessChip({ r }) {
    if (!r) return null;
    return (
        <span className={`inline-flex items-center gap-1.5 text-[11px] font-black px-2 py-0.5 rounded border ${RAG_CLS[r.rag]}`} title={READY_STATUS[r.status]?.hint}>
            <span className={`w-2 h-2 rounded-full ${RAG_DOT[r.rag]}`} />{READY_STATUS[r.status]?.label || r.status}{r.late ? ' · late' : ''}
        </span>
    );
}

export const daysText = (d) => (d == null ? '' : d === 0 ? 'today' : d > 0 ? `in ${d} day${d === 1 ? '' : 's'}` : `${-d} day${d === -1 ? '' : 's'} ago`);

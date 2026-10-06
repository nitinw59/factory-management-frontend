// Shared bits of the order tracker pages: phase names and the red / amber / green / grey dot.
export const PHASES = [
    { key: 'bom', label: 'BOM' },
    { key: 'materials', label: 'Materials' },
    { key: 'issue', label: 'Issue' },
    { key: 'cutting', label: 'Cutting' },
    { key: 'production', label: 'Production' },
    { key: 'milestones', label: 'Milestones' },
];
const DOT = { GREEN: 'bg-emerald-500', AMBER: 'bg-amber-400', RED: 'bg-rose-500', GREY: 'bg-slate-300' };
const CHIP = {
    GREEN: 'bg-emerald-50 text-emerald-800 border-emerald-300', AMBER: 'bg-amber-50 text-amber-800 border-amber-300',
    RED: 'bg-rose-50 text-rose-700 border-rose-300', GREY: 'bg-slate-50 text-slate-500 border-slate-200',
};
export const Dot = ({ rag, title }) => <span title={title} className={`inline-block w-3 h-3 rounded-full ${DOT[rag] || DOT.GREY}`} />;
export const RagChip = ({ rag, children }) => <span className={`inline-flex items-center gap-1.5 text-[11px] font-black px-2 py-0.5 rounded border ${CHIP[rag] || CHIP.GREY}`}><span className={`w-2 h-2 rounded-full ${DOT[rag] || DOT.GREY}`} />{children}</span>;

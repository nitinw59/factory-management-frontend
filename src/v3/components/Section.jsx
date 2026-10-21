// Page sections for 3.0 (20 Oct 2026, asked: "all tables look same so when one table ends and next starts it's
// stressful on the eyes"): each table in its own card with a titled bar, a coloured left edge and a header tint in
// that colour, with room between the cards. First on the cut batch page, then the order tracker.
// `head` / `foot` are the classes for a table's <thead> / <tfoot> inside a section of that tone.
export const TONE = {
    indigo:  { edge: 'border-l-indigo-500',  bar: 'bg-indigo-50 border-indigo-100',   title: 'text-indigo-900',  head: 'bg-indigo-50/60 text-indigo-900/70',   foot: 'bg-indigo-50/70 border-indigo-200' },
    emerald: { edge: 'border-l-emerald-500', bar: 'bg-emerald-50 border-emerald-100', title: 'text-emerald-900', head: 'bg-emerald-50/60 text-emerald-900/70', foot: 'bg-emerald-50/70 border-emerald-200' },
    amber:   { edge: 'border-l-amber-500',   bar: 'bg-amber-50 border-amber-100',     title: 'text-amber-900',   head: 'bg-amber-50/60 text-amber-900/70',     foot: 'bg-amber-50/70 border-amber-200' },
    violet:  { edge: 'border-l-violet-500',  bar: 'bg-violet-50 border-violet-100',   title: 'text-violet-900',  head: 'bg-violet-50/60 text-violet-900/70',   foot: 'bg-violet-50/70 border-violet-200' },
    sky:     { edge: 'border-l-sky-500',     bar: 'bg-sky-50 border-sky-100',         title: 'text-sky-900',     head: 'bg-sky-50/60 text-sky-900/70',         foot: 'bg-sky-50/70 border-sky-200' },
    slate:   { edge: 'border-l-slate-400',   bar: 'bg-slate-50 border-slate-100',     title: 'text-slate-800',   head: 'bg-slate-50 text-slate-500',           foot: 'bg-slate-50 border-slate-200' },
};

export const Section = ({ title, subtitle, right, tone = 'slate', className = 'mb-6', children }) => (
    <section className={`${className} bg-white border border-slate-200 border-l-4 ${TONE[tone].edge} rounded-xl overflow-hidden shadow-sm`}>
        <div className={`flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-2.5 border-b ${TONE[tone].bar}`}>
            <h2 className={`text-sm font-black uppercase tracking-wider ${TONE[tone].title}`}>{title}</h2>
            {subtitle && <span className="text-xs text-slate-500">{subtitle}</span>}
            {right && <span className="ml-auto text-xs font-semibold text-slate-600">{right}</span>}
        </div>
        {children}
    </section>
);

// ▸ / ▾ toggle used by tap-to-expand summary rows.
export const Caret = ({ open }) => <span className={`inline-block text-slate-400 transition-transform ${open ? 'rotate-90' : ''}`}>▸</span>;

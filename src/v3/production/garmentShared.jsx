// Garment stages — the parts 2.0's garment checker shows in both its modes (28 Oct 2026, moved out of GarmentScanner for
// the 2.0-style batch list): the stage chain, the component (part) map, the full-screen popups and the defect sheet.
import { Fragment, useState } from 'react';
import { Check, X, Loader2 } from 'lucide-react';

export const CLEARED = ['APPROVED', 'REPAIRED'];
export const rollOf = (no) => String(no).split('-').slice(-3, -2)[0] || '';

// 2.0's stage chain: passed (green check) · current (amber, pulsing — where it actually is) · upcoming (grey); "(You)" =
// this checker's stage.
const STAGE_STATE_STYLE = {
    passed: { circle: 'bg-emerald-500 border-emerald-500 text-white', label: 'text-emerald-600', line: 'bg-emerald-400' },
    current: { circle: 'bg-amber-500 border-amber-500 text-white animate-pulse', label: 'text-amber-600', line: 'bg-slate-200' },
    upcoming: { circle: 'bg-white border-slate-200 text-slate-300', label: 'text-slate-300', line: 'bg-slate-200' },
};
export function StageProgressStepper({ stages }) {
    if (!stages?.length) return null;
    return (
        <div className="flex items-center gap-1.5 overflow-x-auto py-1">
            {stages.map((s, i) => {
                const style = STAGE_STATE_STYLE[s.state] || STAGE_STATE_STYLE.upcoming;
                return (
                    <Fragment key={s.key}>
                        <div className="flex flex-col items-center shrink-0" title={s.status ? `${s.label} — ${s.status}` : s.label}>
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 font-black text-[11px] ${style.circle} ${s.you ? 'ring-4 ring-red-800' : ''}`}>
                                {s.state === 'passed' ? <Check size={14} strokeWidth={4} /> : i + 1}
                            </div>
                            <span className={`mt-1 text-[9px] font-bold uppercase tracking-wide whitespace-nowrap ${s.you ? 'text-red-800' : style.label}`}>{s.label}{s.you ? ' (You)' : ''}</span>
                        </div>
                        {i < stages.length - 1 && <div className={`h-0.5 flex-1 min-w-[16px] ${style.line}`} />}
                    </Fragment>
                );
            })}
        </div>
    );
}

// The batch's route as the chain for one garment (3.0 data: garment statuses per stage, what still blocks it).
export function stagesOf(view, g, stageId) {
    const idx = view.route.findIndex(r => String(r.stage_type_id) === String(stageId));
    return view.route.map((r, i) => {
        const st = g.statuses?.[r.stage_type_id];
        let state;
        if (r.unit === 'GARMENT') state = CLEARED.includes(st) ? 'passed' : i <= idx ? 'current' : 'upcoming';
        else state = g.blocked_by.some(b => b.startsWith(`${r.name} (`)) ? 'current' : i < idx ? 'passed' : 'upcoming';
        return { key: `${r.stage_type_id}-${i}`, label: r.name, state, you: i === idx, status: st ? st.replace('_', ' ') : '' };
    });
}
// The component map: one chip per part — red when rejected at an earlier stage (not cleared since) or not cleared there yet.
export const partsOf = (g) => g.parts.map(p => {
    const flag = g.flagged.find(f => f.part_name === p.part_name);
    const wait = g.blocked_by.find(b => b.endsWith(`(${p.part_name})`));
    return { id: p.id, name: p.part_name, bad: Boolean(flag || wait), note: flag ? `Rejected @ ${flag.rejected_at}` : wait ? `Not cleared @ ${wait.slice(0, wait.lastIndexOf(' ('))}` : p.replacement ? 'Re-cut' : null };
});

// Full-screen 2.0 popup (BATCH NOT LOADED / NOT AT THIS STAGE / ALREADY APPROVED).
const POPUP = {
    rose: { back: 'bg-rose-950/80', border: 'border-rose-500', disc: 'bg-rose-100', icon: 'text-rose-600', title: 'text-rose-600', box: 'bg-rose-50 border-rose-100', val: 'text-rose-700', btn: 'bg-rose-600 hover:bg-rose-700' },
    amber: { back: 'bg-amber-950/80', border: 'border-amber-400', disc: 'bg-amber-100', icon: 'text-amber-600', title: 'text-amber-600', box: 'bg-amber-50 border-amber-100', val: 'text-amber-700', btn: 'bg-amber-500 hover:bg-amber-600' },
    emerald: { back: 'bg-emerald-950/80', border: 'border-emerald-400', disc: 'bg-emerald-100', icon: 'text-emerald-500', title: 'text-emerald-600', box: 'bg-emerald-50 border-emerald-100', val: 'text-slate-900', btn: 'bg-emerald-600 hover:bg-emerald-700' },
};
export function Popup({ tone, icon: Icon, title, message, rows = [], children, before, onOk, extra }) {
    const c = POPUP[tone];
    return (
        <div className={`fixed inset-0 z-[320] ${c.back} backdrop-blur-sm flex items-center justify-center p-4`}>
            <div className={`bg-white border-[8px] ${c.border} rounded-[3rem] p-8 md:p-10 max-w-2xl w-full max-h-[92vh] overflow-y-auto text-center shadow-2xl`}>
                <div className={`w-24 h-24 ${c.disc} rounded-full flex items-center justify-center mx-auto mb-6`}><Icon className={`w-14 h-14 ${c.icon}`} /></div>
                <h2 className={`text-3xl md:text-5xl font-black ${c.title} tracking-tight mb-3`}>{title}</h2>
                <p className="text-slate-500 font-bold text-lg mb-6">{message}</p>
                {children}
                {rows.length > 0 && (
                    <div className={`${c.box} border-2 rounded-3xl p-6 mb-8 text-left space-y-2.5`}>
                        {rows.map(([l, v]) => <div key={l} className="flex justify-between items-center gap-3"><span className="text-slate-400 font-bold text-xs uppercase tracking-widest">{l}</span><span className={`font-mono font-black text-lg ${c.val}`}>{v}</span></div>)}
                    </div>
                )}
                {before}
                <button type="button" onClick={onOk} className={`px-14 py-5 ${c.btn} text-white font-black text-xl rounded-3xl active:scale-95 shadow-xl w-full`}>OK</button>
                {extra}
            </div>
        </div>
    );
}

// 2.0's defect sheet (REWORK / REPAIR NOW): search, category chips, code tiles — one code, as 3.0 records one per check.
export function DefectSheet({ kind, garment, codes, busy, onConfirm, onClose }) {
    const [defSearch, setDefSearch] = useState('');
    const [defCat, setDefCat] = useState(null);
    const [defCode, setDefCode] = useState(null);
    const cats = [...new Set(codes.map(c => c.category).filter(Boolean))].sort();
    const q = defSearch.trim().toLowerCase();
    const shownCodes = codes.filter(c => (!defCat || c.category === defCat) && (!q || `${c.code} ${c.description} ${c.category || ''}`.toLowerCase().includes(q)));
    return (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-xl z-[300] flex items-end sm:items-center justify-center sm:p-4">
            <div className="bg-white w-full max-w-3xl sm:rounded-[2rem] rounded-t-[2rem] overflow-hidden shadow-2xl flex flex-col h-[95dvh] sm:h-[92vh]">
                <div className={`px-4 py-3 ${kind === 'REWORK' ? 'bg-amber-500' : 'bg-teal-600'} text-white`}>
                    <div className="flex items-center gap-2 mb-2">
                        <span className="font-black text-sm uppercase tracking-widest opacity-90">{kind}</span>
                        <span className="bg-white/20 rounded-lg px-2 py-0.5 font-mono font-black text-xs tracking-wide">{garment.garment_no} · Sz {garment.size}</span>
                        <button type="button" onClick={() => onClose()} className="ml-auto p-1.5 bg-white/20 rounded-full hover:bg-white/30" aria-label="Close"><X size={14} /></button>
                    </div>
                    <input type="text" value={defSearch} onChange={e => setDefSearch(e.target.value)} placeholder="Search defect…" autoFocus
                        className="w-full bg-white/20 placeholder-white/50 text-white font-bold text-sm px-3 py-2 rounded-xl outline-none border border-white/20 focus:border-white/60" />
                    {cats.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                            <button type="button" onClick={() => setDefCat(null)} className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wide border ${!defCat ? 'bg-white text-slate-900 border-white' : 'bg-white/15 text-white border-white/30 hover:bg-white/25'}`}>All</button>
                            {cats.map(c => <button key={c} type="button" onClick={() => setDefCat(x => (x === c ? null : c))} className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wide border ${defCat === c ? 'bg-white text-slate-900 border-white' : 'bg-white/15 text-white border-white/30 hover:bg-white/25'}`}>{c}</button>)}
                        </div>
                    )}
                </div>
                <div className="p-3 grid grid-cols-2 md:grid-cols-3 gap-2 overflow-y-auto flex-1 content-start">
                    {shownCodes.length === 0 ? <div className="col-span-full py-10 text-center text-slate-400 font-bold">No matching defect codes.</div> : shownCodes.map(c => {
                        const on = defCode === c.id;
                        return (
                            <button key={c.id} type="button" onClick={() => setDefCode(on ? null : c.id)}
                                className={`p-3 text-left border-2 rounded-2xl active:scale-95 ${on ? (kind === 'REWORK' ? 'border-amber-400 bg-amber-50' : 'border-teal-400 bg-teal-50') : 'border-slate-100 bg-slate-50 hover:border-indigo-400 hover:bg-indigo-50'}`}>
                                <div className="flex items-center gap-1.5 mb-1">
                                    {c.code && <span className={`font-mono text-[10px] font-black px-1.5 py-0.5 rounded ${on ? `${kind === 'REWORK' ? 'text-amber-600' : 'text-teal-600'} bg-white` : 'text-indigo-500 bg-indigo-50'}`}>{c.code}</span>}
                                    {on && <span className={`ml-auto text-[10px] font-black ${kind === 'REWORK' ? 'text-amber-600' : 'text-teal-600'}`}>✓</span>}
                                </div>
                                <span className={`font-bold text-sm leading-tight line-clamp-2 ${on ? 'text-slate-900' : 'text-slate-700'}`}>{c.description}</span>
                            </button>
                        );
                    })}
                </div>
                <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between gap-3">
                    <button type="button" onClick={() => onClose()} className="px-4 py-2 text-slate-500 font-bold hover:text-slate-700 text-sm">Cancel</button>
                    <button type="button" onClick={() => onConfirm(defCode)} disabled={!defCode || busy}
                        className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-black text-white text-sm disabled:opacity-40 ${kind === 'REWORK' ? 'bg-amber-500 hover:bg-amber-600' : 'bg-teal-600 hover:bg-teal-700'}`}>
                        {busy && <Loader2 size={14} className="animate-spin" />} Confirm {kind}
                    </button>
                </div>
            </div>
        </div>
    );
}

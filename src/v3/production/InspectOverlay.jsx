// Full-screen inspection (18 Oct 2026, modelled on 2.0's universal workstation, which checkers found far easier on
// tablets): big numbered tiles to tap, SELECT ALL, and a bottom bar of three big buttons — APPROVE / REWORK / REJECT
// (or PASSED / FAILED when rework pieces are picked). Rework / Reject then ask the reason on big tiles (category →
// defect). Tapping a checked tile (OK / rejected) offers to undo it. Used for pieces and for garments.
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Check, CheckCircle2, XCircle, Hammer, Lock, RotateCcw, CheckSquare, Square, ArrowLeft, Send, AlertCircle, Loader2, Flag } from 'lucide-react';

// fresh = to check here · fix = in rework here, or rejected at an earlier stage (repair or reject) ·
// done = checked here (tap to undo) · locked = waiting for an earlier stage / re-cut cleared
export const kindOf = (it) => {
    if (it.waiting_replacement) return 'locked';   // flagged for new material — the cutting manager fulfils it (as 2.0)
    if (it.status === 'NEEDS_REWORK') return 'fix';
    if (!it.status) return !it.gate_ok ? 'locked' : it.flag ? 'fix' : 'fresh';
    return it.status === 'RECUT_CLEARED' ? 'locked' : 'done';
};

function tileCls(it, selected) {
    const k = kindOf(it);
    if (selected) return k === 'fix' ? 'bg-amber-500 border-amber-600 text-white shadow-[0_0_20px_rgba(245,158,11,0.8)] scale-105 z-10' : 'bg-indigo-600 border-indigo-500 text-white shadow-[0_0_20px_rgba(79,70,229,0.8)] scale-105 z-10';
    if (it.waiting_replacement) return 'bg-violet-100 border-violet-300 text-violet-600 cursor-not-allowed';
    if (it.status === 'NEEDS_REWORK') return 'bg-amber-300 border-amber-400 text-amber-900';
    if (k === 'fix') return 'bg-white border-rose-500 text-rose-700';
    if (it.status === 'APPROVED') return 'bg-slate-800 border-slate-700 text-emerald-400';
    if (it.status === 'REPAIRED') return 'bg-slate-800 border-slate-700 text-teal-300';
    if (it.status === 'QC_REJECTED') return 'bg-rose-950 border-rose-900 text-rose-400';
    if (k === 'locked') return 'bg-slate-800/60 border-slate-700 text-slate-500 cursor-not-allowed';
    return 'bg-white border-slate-300 text-slate-900 hover:border-indigo-400';
}

export default function InspectOverlay({ head, items, codes, unit = 'piece', startFix = false, highlightId, onClose, onApprove, onRework, onReject, onRepair, onUndo }) {
    const byId = useMemo(() => new Map(items.map(i => [i.id, i])), [items]);
    const [sel, setSel] = useState(() => { const h = highlightId && byId.get(highlightId); return new Set(h && ['fresh', 'fix'].includes(kindOf(h)) ? [h.id] : []); });
    const [picker, setPicker] = useState(null);   // NEEDS_REWORK | QC_REJECTED
    const [category, setCategory] = useState(null);
    const [code, setCode] = useState(null);
    const [search, setSearch] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const hl = useRef(null);
    useEffect(() => { hl.current?.scrollIntoView({ block: 'center' }); }, []);
    // Live refresh: drop picked tiles that someone else has just checked.
    useEffect(() => { setSel(s => { const k = new Set([...s].filter(id => byId.has(id) && ['fresh', 'fix'].includes(kindOf(byId.get(id))))); return k.size === s.size ? s : k; }); }, [byId]);

    const selKind = sel.size ? kindOf(byId.get([...sel][0])) : null;
    const mode = selKind || (startFix ? 'fix' : 'fresh');
    const of = (k) => items.filter(i => kindOf(i) === k);
    const fresh = of('fresh'), fix = of('fix');
    const n = (s) => items.filter(i => i.status === s).length;
    const word = (c) => `${c} ${unit}${c === 1 ? '' : 's'}`;

    const tap = (it) => {
        const k = kindOf(it);
        if (k === 'done') { onUndo?.(it); return; }
        if (k === 'locked') return;
        setError('');
        setSel(s => {
            if (s.size && selKind !== k) return new Set([it.id]);   // one kind at a time
            const x = new Set(s); if (x.has(it.id)) x.delete(it.id); else x.add(it.id); return x;
        });
    };
    const selectAll = (k) => { const list = of(k); setSel(sel.size === list.length && selKind === k ? new Set() : new Set(list.map(i => i.id))); };
    const run = async (fn) => {
        setBusy(true); setError('');
        try { await fn([...sel]); setSel(new Set()); setPicker(null); setCategory(null); setCode(null); setSearch(''); }
        catch (e) { setError(e.message || 'Failed.'); }
        finally { setBusy(false); }
    };

    const cats = [...new Set(codes.map(c => c.category || 'Other'))];
    const ask = (status) => { setPicker(status); setCode(null); setSearch(''); setCategory(cats.length === 1 ? cats[0] : null); };
    const groups = [];
    for (const it of items) { const g = it.group || ''; let x = groups.find(y => y.name === g); if (!x) { x = { name: g, items: [] }; groups.push(x); } x.items.push(it); }
    const amber = picker === 'NEEDS_REWORK';
    const shownCodes = codes.filter(c => (c.category || 'Other') === category && (!search.trim() || `${c.code} ${c.description}`.toLowerCase().includes(search.trim().toLowerCase())));
    const picked = [...sel].map(id => byId.get(id)).filter(Boolean);

    return createPortal(
        <div className="fixed inset-0 bg-slate-950 z-[300] flex flex-col">
            <div className={`${startFix && !picker ? 'bg-amber-400 text-black' : 'bg-black text-white'} px-5 py-3 flex justify-between items-center border-b-2 border-slate-800 shrink-0 gap-3`}>
                <div className="flex flex-wrap items-center gap-4 md:gap-8 min-w-0">
                    {head.map(([l, v], i) => (
                        <div key={l} className={`flex flex-col min-w-0 ${i ? 'border-l border-slate-700 pl-4' : ''}`}>
                            <span className={`text-xs font-black uppercase tracking-widest ${startFix && !picker ? 'text-amber-900' : 'text-slate-500'}`}>{l}</span>
                            <span className={`text-lg md:text-xl font-black uppercase truncate ${i === 1 && !(startFix && !picker) ? 'text-indigo-400' : ''}`}>{v}</span>
                        </div>
                    ))}
                </div>
                <button type="button" onClick={onClose} className="p-3 bg-slate-900 hover:bg-rose-600 rounded-full border border-slate-700 shrink-0" aria-label="Close"><X className="w-6 h-6 text-white" /></button>
            </div>
            {error && <div className="bg-rose-600 text-white font-bold px-5 py-3 text-base shrink-0">{error}</div>}

            {picker ? (
                !category ? (
                    <div className="flex-grow flex flex-col bg-slate-900 min-h-0">
                        <PickedStrip amber={amber} title={amber ? 'Reason for rework' : 'Reason for rejection'} picked={picked} />
                        <div className="flex-grow overflow-y-auto p-6 flex flex-col justify-center">
                            <p className="text-slate-400 text-xs font-black uppercase tracking-widest text-center mb-6">Choose the defect category</p>
                            <div className="grid grid-cols-2 gap-4 max-w-xl mx-auto w-full">
                                {cats.map(c => (
                                    <button key={c} type="button" onClick={() => setCategory(c)} className={`bg-slate-800 border-2 border-slate-600 rounded-2xl p-8 font-black text-white text-xl uppercase tracking-widest active:scale-95 flex flex-col items-center gap-3 ${amber ? 'hover:border-amber-400' : 'hover:border-rose-400'}`}>
                                        <AlertCircle className={`w-10 h-10 ${amber ? 'text-amber-400' : 'text-rose-400'}`} />{c}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <CancelBar onClick={() => setPicker(null)} />
                    </div>
                ) : (
                    <div className="flex-grow flex flex-col bg-slate-900 min-h-0">
                        <div className={`px-6 py-3 shrink-0 flex items-center gap-3 ${amber ? 'bg-amber-500' : 'bg-rose-700'}`}>
                            {cats.length > 1 && <button type="button" onClick={() => { setCategory(null); setCode(null); setSearch(''); }} className={`p-3 rounded-lg ${amber ? 'bg-amber-600' : 'bg-rose-800'}`} aria-label="Back"><ArrowLeft className="w-6 h-6 text-white" /></button>}
                            <div className="min-w-0">
                                <p className={`font-black text-base uppercase tracking-widest ${amber ? 'text-black' : 'text-white'}`}>{category} — {word(picked.length)}</p>
                                <p className={`text-sm font-mono font-black ${amber ? 'text-amber-950' : 'text-rose-100'}`}>{picked.map(p => `#${p.label}`).join(' ')}</p>
                            </div>
                        </div>
                        <div className="px-6 py-3 bg-slate-800 border-b border-slate-700 shrink-0 flex flex-col sm:flex-row gap-3">
                            <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search defect…" className="flex-1 px-4 py-3 bg-slate-700 text-white placeholder-slate-400 rounded-xl border border-slate-600 focus:outline-none focus:border-indigo-400 text-base" />
                            <button type="button" disabled={!code || busy} onClick={() => run((ids) => (amber ? onRework : onReject)(ids, code))}
                                className={`sm:w-72 disabled:opacity-30 text-white font-black py-3 rounded-xl uppercase tracking-widest active:scale-95 flex items-center justify-center gap-2 text-base ${amber ? 'bg-amber-600' : 'bg-rose-600'}`}>
                                {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />} Confirm {amber ? 'rework' : 'reject'}
                            </button>
                        </div>
                        <div className="flex-grow min-h-0 overflow-y-auto p-4">
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                {shownCodes.map(d => {
                                    const on = code === d.id;
                                    return (
                                        <button key={d.id} type="button" onClick={() => setCode(on ? null : d.id)}
                                            className={`relative p-4 rounded-xl text-left active:scale-95 border-2 ${on ? (amber ? 'bg-amber-600 border-amber-300' : 'bg-rose-700 border-rose-300') : 'bg-slate-800 border-slate-600 hover:border-slate-400'}`}>
                                            {on && <Check className="absolute top-2 right-2 w-5 h-5 text-white" strokeWidth={3} />}
                                            <span className={`block text-sm font-bold uppercase tracking-widest mb-1 ${amber ? 'text-amber-300' : 'text-rose-300'} ${on ? '!text-white' : ''}`}>{d.code}</span>
                                            <span className="text-white text-[17px] font-black leading-snug">{d.description}</span>
                                        </button>
                                    );
                                })}
                                {shownCodes.length === 0 && <p className="col-span-full text-slate-500 text-center py-8 font-bold">No matching defect codes.</p>}
                            </div>
                        </div>
                        <CancelBar onClick={() => setPicker(null)} />
                    </div>
                )
            ) : (
                <>
                    <div className="bg-slate-900 px-5 py-2 border-b border-slate-800 flex flex-wrap justify-between items-center gap-2 shrink-0">
                        <span className="text-xs font-black uppercase tracking-widest text-slate-400">
                            {fresh.length} to check · {fix.length} to fix · {n('APPROVED') + n('REPAIRED')} OK · {n('QC_REJECTED')} rejected{items.some(i => kindOf(i) === 'locked' && !i.status) ? ` · ${items.filter(i => kindOf(i) === 'locked' && !i.status).length} waiting` : ''}
                        </span>
                        <span className="flex gap-2">
                            {fresh.length > 0 && <button type="button" onClick={() => selectAll('fresh')} className="px-4 py-2.5 bg-white text-black font-black rounded-xl active:scale-95 flex items-center tracking-widest text-sm">
                                {selKind === 'fresh' && sel.size === fresh.length ? <Square className="w-4 h-4 mr-2" /> : <CheckSquare className="w-4 h-4 mr-2" />}{selKind === 'fresh' && sel.size === fresh.length ? 'DESELECT ALL' : `SELECT ALL (${fresh.length})`}</button>}
                            {fix.length > 0 && <button type="button" onClick={() => selectAll('fix')} className="px-4 py-2.5 bg-amber-400 text-black font-black rounded-xl active:scale-95 flex items-center tracking-widest text-sm">
                                <Hammer className="w-4 h-4 mr-2" />{selKind === 'fix' && sel.size === fix.length ? 'DESELECT' : `ALL TO FIX (${fix.length})`}</button>}
                        </span>
                    </div>
                    <div className="flex-grow overflow-y-auto p-4 md:p-8">
                        <div className="space-y-8">
                            {groups.map(g => (
                                <div key={g.name}>
                                    {g.name && <h4 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-4 border-b-2 border-slate-700 pb-2">{g.name}</h4>}
                                    <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-3 md:gap-4">
                                        {g.items.map(it => {
                                            const on = sel.has(it.id); const k = kindOf(it);
                                            return (
                                                <button key={it.id} type="button" ref={it.id === highlightId ? hl : undefined} onClick={() => tap(it)} title={it.title || ''}
                                                    className={`relative aspect-square rounded-2xl border-4 font-mono font-black text-2xl md:text-3xl flex items-center justify-center transition-all active:scale-95 ${tileCls(it, on)} ${it.id === highlightId && !on ? 'ring-4 ring-sky-400 animate-pulse' : ''}`}>
                                                    {it.label}
                                                    {on && <Check className={`absolute top-1.5 right-1.5 w-7 h-7 rounded-full p-1 ${k === 'fix' ? 'bg-amber-700' : 'bg-indigo-400'} text-white`} strokeWidth={4} />}
                                                    {!on && it.status === 'NEEDS_REWORK' && <Hammer className="absolute top-1.5 right-1.5 w-5 h-5 text-amber-700" />}
                                                    {it.status === 'QC_REJECTED' && <Lock className="absolute top-1.5 right-1.5 w-5 h-5 text-rose-400" />}
                                                    {(it.status === 'APPROVED' || it.status === 'REPAIRED') && <RotateCcw className="absolute top-1.5 right-1.5 w-5 h-5 text-emerald-500" />}
                                                    {it.replacement && <span className="absolute top-1 left-1.5 text-[10px] font-sans font-black text-sky-500">RE-CUT</span>}
                                                    {!it.status && it.flag && <span className="absolute bottom-1 left-1 right-1 text-[9px] leading-tight font-sans font-black uppercase text-white bg-rose-600 rounded px-1 truncate">✗ {it.flag}</span>}
                                                    {it.waiting_replacement && <span className="absolute bottom-1 left-1 right-1 text-[9px] leading-tight font-sans font-black uppercase text-white bg-violet-600 rounded px-1 truncate">Replacement</span>}
                                                    {k === 'locked' && !it.status && <span className="absolute bottom-1 left-1 right-1 text-[9px] leading-tight font-sans font-black uppercase text-amber-900 bg-amber-200 rounded px-1 truncate">Wait {it.blocked}</span>}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>
                        <p className="mt-8 text-xs text-slate-500 text-center">Tap numbers to pick. White = to check · amber = rework · red edge = rejected earlier (fix it) · dark = done here — tap a done tile to undo it.</p>
                    </div>
                    <div className={`bg-white p-4 border-t-4 ${mode === 'fix' ? 'border-amber-400' : 'border-slate-300'} shrink-0`}>
                        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-4">
                            <div className={`px-5 py-3 rounded-xl border-2 text-center min-w-[140px] ${mode === 'fix' ? 'bg-amber-50 border-amber-200' : 'bg-slate-100 border-slate-300'}`}>
                                <span className={`block text-xs font-black uppercase mb-0.5 tracking-widest ${mode === 'fix' ? 'text-amber-600' : 'text-slate-500'}`}>{mode === 'fix' ? 'Fixing' : 'Selected'}</span>
                                <span className="text-4xl font-black text-black leading-none">{sel.size}</span>
                            </div>
                            {mode === 'fix' ? (
                                <div className="flex-grow grid grid-cols-2 gap-4 h-[64px]">
                                    <BigBtn tone="rose" disabled={!sel.size || busy} onClick={() => ask('QC_REJECTED')}><XCircle className="w-6 h-6 mr-2" /> FAILED</BigBtn>
                                    <BigBtn tone="emerald" disabled={!sel.size || busy} onClick={() => run(onRepair)}>{busy ? <Loader2 className="w-6 h-6 mr-2 animate-spin" /> : <CheckCircle2 className="w-6 h-6 mr-2" />} PASSED</BigBtn>
                                </div>
                            ) : (
                                <div className="flex-grow grid grid-cols-3 gap-3 md:gap-4 h-[64px]">
                                    <BigBtn tone="emerald" disabled={!sel.size || busy} onClick={() => run(onApprove)}>{busy ? <Loader2 className="w-6 h-6 mr-2 animate-spin" /> : <CheckCircle2 className="w-6 h-6 mr-2" />} APPROVE</BigBtn>
                                    <BigBtn tone="amber" disabled={!sel.size || busy} onClick={() => ask('NEEDS_REWORK')}><Hammer className="w-6 h-6 mr-2" /> REWORK</BigBtn>
                                    <BigBtn tone="rose" disabled={!sel.size || busy} onClick={() => ask('QC_REJECTED')}><XCircle className="w-6 h-6 mr-2" /> REJECT</BigBtn>
                                </div>
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>,
        document.body,
    );
}

const BTN = { emerald: 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-800', amber: 'bg-amber-400 hover:bg-amber-500 text-black border-amber-600', rose: 'bg-rose-600 hover:bg-rose-700 text-white border-rose-800' };
const BigBtn = ({ tone, children, ...p }) => <button type="button" {...p} className={`w-full h-full rounded-xl font-black text-base md:text-lg shadow-xl active:scale-95 disabled:opacity-30 flex items-center justify-center border-b-4 ${BTN[tone]}`}>{children}</button>;
const CancelBar = ({ onClick }) => (
    <div className="px-6 py-4 bg-slate-800 border-t border-slate-700 shrink-0">
        <button type="button" onClick={onClick} className="w-full bg-slate-700 text-slate-200 font-black py-4 rounded-xl uppercase tracking-widest hover:bg-slate-600 text-base">Cancel</button>
    </div>
);
const PickedStrip = ({ amber, title, picked }) => (
    <div className={`px-6 py-3 shrink-0 ${amber ? 'bg-amber-500' : 'bg-rose-700'}`}>
        <p className={`text-xs font-black uppercase tracking-widest mb-2 flex items-center gap-1.5 ${amber ? 'text-black' : 'text-white'}`}><Flag className="w-3.5 h-3.5" /> {title} — {picked.length}</p>
        <div className="flex flex-wrap gap-1.5">{picked.map(p => <span key={p.id} className={`px-2 py-0.5 rounded-md font-mono font-black text-sm ${amber ? 'bg-amber-600 text-black' : 'bg-rose-900 text-rose-200'}`}>{p.label}</span>)}</div>
    </div>
);

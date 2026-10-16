// A BOM download with a choice (Excel 15 Oct 2026, PDF too 16 Oct 2026): Detailed BOM (every garment colour on its
// own row) or Summary BOM (a BOM line as one MATCH TO COLOR / BY SIZE / DTM / Same in all row). onPick(summary) makes
// the file; label / icon say which file (default: Excel).
import { useEffect, useRef, useState } from 'react';
import { FileSpreadsheet } from 'lucide-react';
import { SecondaryButton } from '../components/ui';

export default function BomExcelChoice({ onPick, disabled, label = 'Excel', icon: Icon = FileSpreadsheet, title = 'Excel: detailed or summary' }) {
    const [open, setOpen] = useState(false);
    const box = useRef(null);
    useEffect(() => {
        if (!open) return undefined;
        const close = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, [open]);
    const pick = (summary) => { setOpen(false); onPick(summary); };
    return (
        <span ref={box} className="relative inline-block">
            <SecondaryButton disabled={disabled} onClick={() => setOpen(o => !o)} title={title}><Icon size={14} /> {label} ▾</SecondaryButton>
            {open && (
                <div className="absolute right-0 z-20 mt-1 w-72 rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
                    <button type="button" onClick={() => pick(false)} className="block w-full rounded px-3 py-2 text-left hover:bg-slate-50">
                        <span className="block text-sm font-bold text-slate-800">Detailed BOM</span>
                        <span className="block text-xs text-slate-500">Every garment colour on its own row</span>
                    </button>
                    <button type="button" onClick={() => pick(true)} className="block w-full rounded px-3 py-2 text-left hover:bg-slate-50">
                        <span className="block text-sm font-bold text-slate-800">Summary BOM</span>
                        <span className="block text-xs text-slate-500">One row per BOM line: MATCH TO COLOR, BY SIZE, DTM</span>
                    </button>
                </div>
            )}
        </span>
    );
}

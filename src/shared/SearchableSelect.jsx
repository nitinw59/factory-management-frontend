import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Search } from 'lucide-react';

const ACCENT = {
    orange: { selected: 'font-bold text-orange-600 bg-orange-50', focus: 'focus:border-orange-400' },
    violet: { selected: 'font-bold text-violet-600 bg-violet-50', focus: 'focus:border-violet-400' },
    amber:  { selected: 'font-bold text-amber-600 bg-amber-50',   focus: 'focus:border-amber-400'  },
};

const SIZE = {
    xs:   'text-[11px] px-1.5 py-1 rounded',
    sm:   'text-xs px-2 py-1 rounded',
    base: 'text-sm px-3 py-1.5 rounded-lg',
};

export default function SearchableSelect({
    value,
    onChange,
    options = [],
    placeholder = '— Select —',
    disabled = false,
    className = '',
    size = 'base',
    accentColor = 'orange',
}) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });
    const triggerRef = useRef(null);
    const dropdownRef = useRef(null);
    const searchRef = useRef(null);

    const selected = options.find(o => String(o.value) === String(value));
    const filtered = query
        ? options.filter(o => o.label.toLowerCase().includes(query.toLowerCase()))
        : options;

    const updatePos = useCallback(() => {
        if (!triggerRef.current) return;
        const r = triggerRef.current.getBoundingClientRect();
        setPos({ top: r.bottom + 4, left: r.left, width: r.width });
    }, []);

    useEffect(() => {
        if (!open) return;
        updatePos();
        searchRef.current?.focus();
    }, [open, updatePos]);

    useEffect(() => {
        if (!open) return;
        const onDown = (e) => {
            if (
                !triggerRef.current?.contains(e.target) &&
                !dropdownRef.current?.contains(e.target)
            ) {
                setOpen(false);
                setQuery('');
            }
        };
        document.addEventListener('mousedown', onDown);
        window.addEventListener('scroll', updatePos, true);
        window.addEventListener('resize', updatePos);
        return () => {
            document.removeEventListener('mousedown', onDown);
            window.removeEventListener('scroll', updatePos, true);
            window.removeEventListener('resize', updatePos);
        };
    }, [open, updatePos]);

    const pick = (val) => {
        onChange(val);
        setOpen(false);
        setQuery('');
    };

    const accent = ACCENT[accentColor] || ACCENT.orange;
    const sizeClass = SIZE[size] || SIZE.base;

    return (
        <div className={className}>
            <button
                ref={triggerRef}
                type="button"
                disabled={disabled}
                onClick={() => { if (!disabled) setOpen(v => !v); }}
                className={`w-full flex items-center justify-between gap-1 border border-slate-200 bg-white ${sizeClass} ${accent.focus} focus:outline-none disabled:bg-slate-100 disabled:text-slate-400 text-left transition-colors`}
            >
                <span className={`flex-1 truncate min-w-0 ${selected ? 'text-slate-800' : 'text-slate-400'}`}>
                    {selected ? selected.label : placeholder}
                </span>
                <ChevronDown
                    size={10}
                    className={`shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
                />
            </button>

            {open && createPortal(
                <div
                    ref={dropdownRef}
                    style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width, zIndex: 9999 }}
                    className="bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden"
                >
                    <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-slate-100">
                        <Search size={11} className="text-slate-400 shrink-0" />
                        <input
                            ref={searchRef}
                            type="text"
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                            placeholder="Search…"
                            className="flex-1 min-w-0 text-xs outline-none text-slate-700 placeholder-slate-400"
                        />
                    </div>
                    <div className="max-h-48 overflow-y-auto">
                        {filtered.length === 0 ? (
                            <p className="px-3 py-2 text-xs text-slate-400 italic">No results</p>
                        ) : filtered.map(o => (
                            <button
                                key={o.value}
                                type="button"
                                onMouseDown={e => e.preventDefault()}
                                onClick={() => pick(o.value)}
                                className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${
                                    String(o.value) === String(value)
                                        ? accent.selected
                                        : 'text-slate-700 hover:bg-slate-50'
                                }`}
                            >
                                {o.label}
                            </button>
                        ))}
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}

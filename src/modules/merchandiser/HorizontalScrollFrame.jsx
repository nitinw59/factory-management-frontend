// ─── HORIZONTAL SCROLL FRAME ────────────────────────────────────────────────
// Wraps a wide table (FabricRequirementsGrid / TrimRequirementsGrid) with a
// thin bar of ◀ ▶ buttons sitting right above the header row, for grids with
// enough color columns to overflow — nudges the scroll container instead of
// relying purely on trackpad/scrollbar drag.

import { useRef, useState, useCallback, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const SCROLL_STEP = 260;

const HorizontalScrollFrame = ({ children }) => {
    const containerRef = useRef(null);
    const [canLeft,  setCanLeft]  = useState(false);
    const [canRight, setCanRight] = useState(false);

    const updateEdges = useCallback(() => {
        const el = containerRef.current;
        if (!el) return;
        setCanLeft(el.scrollLeft > 2);
        setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
    }, []);

    useEffect(() => {
        updateEdges();
        const el = containerRef.current;
        if (!el) return;
        el.addEventListener('scroll', updateEdges, { passive: true });
        const ro = new ResizeObserver(updateEdges);
        ro.observe(el);
        return () => { el.removeEventListener('scroll', updateEdges); ro.disconnect(); };
    }, [updateEdges, children]);

    const scroll = (dir) => containerRef.current?.scrollBy({ left: dir * SCROLL_STEP, behavior: 'smooth' });

    return (
        <div>
            {(canLeft || canRight) && (
                <div className="flex items-center justify-end gap-1 mb-1.5">
                    <button
                        type="button"
                        onClick={() => scroll(-1)}
                        disabled={!canLeft}
                        title="Scroll left"
                        className="p-1 rounded-md border border-slate-200 text-slate-500 bg-white hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                        <ChevronLeft size={14} />
                    </button>
                    <button
                        type="button"
                        onClick={() => scroll(1)}
                        disabled={!canRight}
                        title="Scroll right"
                        className="p-1 rounded-md border border-slate-200 text-slate-500 bg-white hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                        <ChevronRight size={14} />
                    </button>
                </div>
            )}
            <div ref={containerRef} className="overflow-x-auto">
                {children}
            </div>
        </div>
    );
};

export default HorizontalScrollFrame;

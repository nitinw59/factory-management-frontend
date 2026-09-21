// Fixed-position popover anchored under a trigger button, escaping any
// scroll-clipping ancestor via a body portal. Closes on outside click.
// Unstyled by default beyond `className` (light theme) so dark-themed
// callers can override it entirely.
import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

const AnchoredPopover = ({
    anchorEl, onClose, width = 240, align = 'left',
    className = 'bg-white rounded-xl shadow-2xl border border-slate-200 p-3',
    children,
}) => {
    const ref = useRef(null);
    const [pos, setPos] = useState(null);

    useEffect(() => {
        if (!anchorEl) return;
        const r = anchorEl.getBoundingClientRect();
        const left = align === 'right'
            ? Math.max(8, Math.min(r.right - width, window.innerWidth - width - 8))
            : Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
        setPos({ top: r.bottom + 6, left });
    }, [anchorEl, align, width]);

    useEffect(() => {
        const onDown = (e) => {
            if (ref.current && !ref.current.contains(e.target) && anchorEl && !anchorEl.contains(e.target)) onClose();
        };
        document.addEventListener('mousedown', onDown);
        return () => document.removeEventListener('mousedown', onDown);
    }, [anchorEl, onClose]);

    if (!pos) return null;
    return createPortal(
        <div
            ref={ref}
            style={{ position: 'fixed', top: pos.top, left: pos.left, width, zIndex: 1000 }}
            className={className}
        >
            {children}
        </div>,
        document.body
    );
};

export default AnchoredPopover;
